import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { MongoClient, type Db } from "mongodb";
import type { Draft, MarginSettings, Quote, ShipmentRecord } from "./types";

/**
 * Storage for settings, drafts, quotes, shipments and admin sign-in attempts.
 *
 * - With MONGODB_URI set (e.g. MongoDB Atlas), data lives in MongoDB. Required on Vercel/serverless,
 *   where the filesystem is read-only.
 * - Otherwise it falls back to a JSON file in DATA_DIR, which is fine for local development.
 */

/** Quotes are only purchasable for this long after rates are fetched. */
export const QUOTE_TTL_MS = 60 * 60 * 1000;
/** Quotes and drafts are deleted 24 hours after they were last quoted. */
export const DRAFT_KEEP_MS = 24 * 60 * 60 * 1000;
const QUOTE_KEEP_MS = DRAFT_KEEP_MS;

function defaultSettings(): MarginSettings {
  return {
    percent: Number(process.env.DEFAULT_MARGIN_PERCENT ?? 15),
    flatFee: Number(process.env.DEFAULT_FLAT_FEE ?? 0),
    updatedAt: null,
  };
}

type ClaimResult = { quote: Quote } | { error: string; status: number };

function checkQuote(quote: Quote | null | undefined): ClaimResult | null {
  if (!quote) return { error: "This rate is no longer available. Get rates again.", status: 404 };
  if (quote.usedAt) return { error: "A label was already bought with this rate.", status: 409 };
  if (Date.now() - Date.parse(quote.createdAt) > QUOTE_TTL_MS)
    return { error: "This rate has expired. Get rates again.", status: 410 };
  return null;
}

/** Failed admin sign-ins for one device or IP. */
export type LoginAttempts = {
  failures: number;
  /** How many lockouts so far; each one lasts longer. */
  level: number;
  lockedUntil: string | null;
  updatedAt: string;
};
/** Lock records are forgotten this long after the last activity (so the lockout level eventually resets). */
const ATTEMPTS_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/** Two-factor sign-in settings. Secrets are stored encrypted (see lib/totp.ts). */
export type SecuritySettings = {
  totpSecret: string | null;
  /** Secret shown during setup, until the first code confirms it. */
  totpPending: string | null;
  totpEnabledAt: string | null;
  /** Last accepted code's time step, so a code can't be used twice. */
  totpLastStep: number;
  /** Booking login (home screen). Null until set in Admin → Security; BOOKING_* env vars are the fallback. */
  bookingUsername: string | null;
  bookingPasswordHash: string | null;
  bookingUpdatedAt: string | null;
};
const defaultSecurity = (): SecuritySettings => ({
  totpSecret: null,
  totpPending: null,
  totpEnabledAt: null,
  totpLastStep: -1,
  bookingUsername: null,
  bookingPasswordHash: null,
  bookingUpdatedAt: null,
});

/** "admin" can use everything; "user" (booking login) can get rates and book labels only. */
export type Role = "admin" | "user";

/** A signed-in admin session. Signing out deletes it, so its cookie stops working right away. */
export type AdminSession = {
  id: string;
  createdAt: string;
  expiresAt: string;
  userAgent: string;
  /** Missing on sessions created before roles existed; those were admin sign-ins. */
  role?: Role;
  username?: string;
};

type Store = {
  getSettings(): Promise<MarginSettings>;
  updateSettings(input: { percent: number; flatFee: number }): Promise<MarginSettings>;
  /**
   * Saves a price check: upserts its draft and stores its new quotes. The draft's earlier quotes
   * that were never bought are deleted, so re-quoting the same shipment doesn't pile up duplicates.
   */
  saveDraftWithQuotes(draft: Draft, quotes: Quote[]): Promise<void>;
  /** Drafts quoted in the last 24 hours, newest first. */
  listDrafts(): Promise<Draft[]>;
  getDraft(id: string): Promise<Draft | null>;
  /** Removes a draft and its unbought quotes. */
  deleteDraft(id: string): Promise<void>;
  /** Atomically claims a quote for purchase. Returns the quote, or a reason it can't be used. */
  claimQuote(rateId: string): Promise<ClaimResult>;
  releaseQuote(rateId: string): Promise<void>;
  addShipment(record: ShipmentRecord): Promise<void>;
  listShipments(): Promise<ShipmentRecord[]>;
  getLoginAttempts(keys: string[]): Promise<Record<string, LoginAttempts>>;
  /** Atomically adds one failure and returns the updated record. */
  addLoginFailure(key: string): Promise<LoginAttempts>;
  /** Starts a lockout: failures back to 0, level + 1. Skipped if another request already did it. */
  lockLogin(key: string, seenFailures: number, lockedUntil: string): Promise<void>;
  clearLoginAttempts(keys: string[]): Promise<void>;
  /** Devices/IPs locked right now. */
  listLockedLogins(): Promise<{ key: string; lockedUntil: string; level: number }[]>;
  clearAllLoginAttempts(): Promise<void>;
  getSecurity(): Promise<SecuritySettings>;
  updateSecurity(patch: Partial<SecuritySettings>): Promise<SecuritySettings>;
  createSession(s: AdminSession): Promise<void>;
  /** The session if it exists and hasn't expired. */
  getSession(id: string): Promise<AdminSession | null>;
  listSessions(): Promise<AdminSession[]>;
  deleteSession(id: string): Promise<void>;
  /** Signs out every session except `keepId` (or all of them). */
  deleteOtherSessions(keepId?: string): Promise<void>;
  deleteSessionsByRole(role: Role): Promise<void>;
  /** Counts one hit for `key` in the current fixed window and returns the count so far. */
  rateLimitHit(key: string, windowMs: number): Promise<number>;
};

// ---------------------------------------------------------------------------
// MongoDB
// ---------------------------------------------------------------------------
type QuoteDoc = Quote & { _id: string; expiresAt: Date };
type DraftDoc = Draft & { _id: string; expiresAt: Date };
type ShipmentDoc = ShipmentRecord & { _id: string };
type SettingsDoc = MarginSettings & { _id: string };
type AttemptsDoc = LoginAttempts & { _id: string; expiresAt: Date };
type SecurityDoc = SecuritySettings & { _id: string };
type SessionDoc = AdminSession & { _id: string; expiresAtDate: Date };
type RateDoc = { _id: string; count: number; expiresAt: Date };

function mongoStore(getDb: () => Promise<Db>): Store {
  const col = async () => {
    const db = await getDb();
    return {
      settings: db.collection<SettingsDoc>("settings"),
      quotes: db.collection<QuoteDoc>("quotes"),
      drafts: db.collection<DraftDoc>("drafts"),
      shipments: db.collection<ShipmentDoc>("shipments"),
      attempts: db.collection<AttemptsDoc>("login_attempts"),
      security: db.collection<SecurityDoc>("settings"),
      sessions: db.collection<SessionDoc>("admin_sessions"),
      rates: db.collection<RateDoc>("rate_limits"),
    };
  };
  const strip = <T extends { _id: string }>({ _id, ...rest }: T) => rest;
  const quoteOnly = ({ _id, expiresAt, ...q }: QuoteDoc): Quote => q;
  const draftOnly = ({ _id, expiresAt, ...d }: DraftDoc): Draft => d;

  return {
    async getSettings() {
      const doc = await (await col()).settings.findOne({ _id: "margin" });
      return doc ? strip(doc) : defaultSettings();
    },
    async updateSettings(input) {
      const settings = { ...input, updatedAt: new Date().toISOString() };
      await (await col()).settings.replaceOne({ _id: "margin" }, settings, { upsert: true });
      return settings;
    },
    async saveDraftWithQuotes(draft, quotes) {
      const { drafts, quotes: qs } = await col();
      // MongoDB deletes drafts and quotes once expiresAt passes (TTL indexes created in connect()).
      const expiresAt = new Date(Date.parse(draft.updatedAt) + DRAFT_KEEP_MS);
      const { createdAt, ...rest } = draft;
      await drafts.updateOne(
        { _id: draft.id },
        { $set: { ...rest, expiresAt }, $setOnInsert: { createdAt } },
        { upsert: true },
      );
      await qs.deleteMany({ draftId: draft.id, usedAt: null, _id: { $nin: quotes.map((q) => q.rateId) } });
      if (!quotes.length) return;
      await qs.bulkWrite(
        quotes.map((q) => ({
          replaceOne: {
            filter: { _id: q.rateId },
            replacement: { ...q, expiresAt: new Date(Date.parse(q.createdAt) + QUOTE_KEEP_MS) },
            upsert: true,
          },
        })),
      );
    },
    async listDrafts() {
      const docs = await (await col()).drafts
        .find({ expiresAt: { $gt: new Date() } })
        .sort({ updatedAt: -1 })
        .limit(50)
        .toArray();
      return docs.map(draftOnly);
    },
    async getDraft(id) {
      const doc = await (await col()).drafts.findOne({ _id: id, expiresAt: { $gt: new Date() } });
      return doc ? draftOnly(doc) : null;
    },
    async deleteDraft(id) {
      const { drafts, quotes } = await col();
      await Promise.all([drafts.deleteOne({ _id: id }), quotes.deleteMany({ draftId: id, usedAt: null })]);
    },
    async claimQuote(rateId) {
      const { quotes } = await col();
      const doc = await quotes.findOne({ _id: rateId });
      const problem = checkQuote(doc && quoteOnly(doc));
      if (problem) return problem;
      // The usedAt: null filter makes this atomic: only one request can claim the quote.
      const usedAt = new Date().toISOString();
      const claimed = await quotes.findOneAndUpdate(
        { _id: rateId, usedAt: null },
        { $set: { usedAt } },
        { returnDocument: "after" },
      );
      if (!claimed) return { error: "A label was already bought with this rate.", status: 409 };
      return { quote: quoteOnly(claimed) };
    },
    async releaseQuote(rateId) {
      await (await col()).quotes.updateOne({ _id: rateId }, { $set: { usedAt: null } });
    },
    async addShipment(record) {
      await (await col()).shipments.insertOne({ _id: record.id, ...record });
    },
    async listShipments() {
      const docs = await (await col()).shipments.find().sort({ createdAt: -1 }).toArray();
      return docs.map(strip);
    },
    async getLoginAttempts(keys) {
      const docs = await (await col()).attempts.find({ _id: { $in: keys } }).toArray();
      return Object.fromEntries(docs.map(({ _id, expiresAt, ...a }) => [_id, a]));
    },
    async addLoginFailure(key) {
      const now = new Date();
      const doc = await (await col()).attempts.findOneAndUpdate(
        { _id: key },
        {
          $inc: { failures: 1 },
          $set: { updatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + ATTEMPTS_KEEP_MS) },
          $setOnInsert: { level: 0, lockedUntil: null },
        },
        { upsert: true, returnDocument: "after" },
      );
      const { _id, expiresAt, ...a } = doc!;
      return a;
    },
    async lockLogin(key, seenFailures, lockedUntil) {
      await (await col()).attempts.updateOne(
        { _id: key, failures: seenFailures },
        {
          $set: { failures: 0, lockedUntil, expiresAt: new Date(Date.parse(lockedUntil) + ATTEMPTS_KEEP_MS) },
          $inc: { level: 1 },
        },
      );
    },
    async clearLoginAttempts(keys) {
      await (await col()).attempts.deleteMany({ _id: { $in: keys } });
    },
    async listLockedLogins() {
      const now = new Date().toISOString();
      const docs = await (await col()).attempts.find({ lockedUntil: { $gt: now } }).toArray();
      return docs.map((d) => ({ key: d._id, lockedUntil: d.lockedUntil!, level: d.level }));
    },
    async clearAllLoginAttempts() {
      await (await col()).attempts.deleteMany({});
    },
    async getSecurity() {
      const doc = await (await col()).security.findOne({ _id: "security" });
      return doc ? { ...defaultSecurity(), ...strip(doc) } : defaultSecurity();
    },
    async updateSecurity(patch) {
      const { security } = await col();
      await security.updateOne({ _id: "security" }, { $set: patch }, { upsert: true });
      return { ...defaultSecurity(), ...strip((await security.findOne({ _id: "security" }))!) };
    },
    async createSession(sess) {
      await (await col()).sessions.insertOne({ _id: sess.id, ...sess, expiresAtDate: new Date(sess.expiresAt) });
    },
    async getSession(id) {
      const doc = await (await col()).sessions.findOne({ _id: id, expiresAtDate: { $gt: new Date() } });
      if (!doc) return null;
      const { _id, expiresAtDate, ...sess } = doc;
      return sess;
    },
    async listSessions() {
      const docs = await (await col()).sessions.find({ expiresAtDate: { $gt: new Date() } }).sort({ createdAt: -1 }).toArray();
      return docs.map(({ _id, expiresAtDate, ...sess }) => sess);
    },
    async deleteSession(id) {
      await (await col()).sessions.deleteOne({ _id: id });
    },
    async deleteOtherSessions(keepId) {
      await (await col()).sessions.deleteMany(keepId ? { _id: { $ne: keepId } } : {});
    },
    async deleteSessionsByRole(role) {
      await (await col()).sessions.deleteMany({ role });
    },
    async rateLimitHit(key, windowMs) {
      const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
      const doc = await (await col()).rates.findOneAndUpdate(
        { _id: `${key}@${windowStart}` },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowStart + windowMs) } },
        { upsert: true, returnDocument: "after" },
      );
      return doc?.count ?? 1;
    },
  };
}

// ---------------------------------------------------------------------------
// JSON file (local development)
// ---------------------------------------------------------------------------
type FileDB = {
  settings: MarginSettings;
  drafts: Record<string, Draft>;
  quotes: Record<string, Quote>;
  shipments: ShipmentRecord[];
  loginAttempts: Record<string, LoginAttempts>;
  security: SecuritySettings;
  sessions: Record<string, AdminSession>;
  rateLimits: Record<string, { count: number; expiresAt: number }>;
};

function fileStore(): Store {
  const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
  const DB_FILE = path.join(DATA_DIR, "shipbridge.json");
  const empty = (): FileDB => ({
    settings: defaultSettings(),
    drafts: {},
    quotes: {},
    shipments: [],
    loginAttempts: {},
    security: defaultSecurity(),
    sessions: {},
    rateLimits: {},
  });
  const live = (x: AdminSession) => Date.parse(x.expiresAt) > Date.now();
  const fresh = (d: Draft) => Date.parse(d.updatedAt) > Date.now() - DRAFT_KEEP_MS;

  /** Deletes drafts and quotes older than 24 hours. */
  function prune(db: FileDB) {
    const cutoff = Date.now() - QUOTE_KEEP_MS;
    for (const [id, q] of Object.entries(db.quotes)) if (Date.parse(q.createdAt) < cutoff) delete db.quotes[id];
    for (const [id, d] of Object.entries(db.drafts)) if (!fresh(d)) delete db.drafts[id];
  }

  async function read(): Promise<FileDB> {
    try {
      return { ...empty(), ...JSON.parse(await fs.readFile(DB_FILE, "utf8")) };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return empty();
      throw err;
    }
  }

  async function write(db: FileDB) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${DB_FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 2));
    await fs.rename(tmp, DB_FILE);
  }

  // Serialize all writes so concurrent requests can't clobber each other.
  let queue: Promise<unknown> = Promise.resolve();
  function mutate<T>(fn: (db: FileDB) => T | Promise<T>): Promise<T> {
    const run = queue.then(async () => {
      const db = await read();
      const result = await fn(db);
      await write(db);
      return result;
    });
    queue = run.catch(() => undefined);
    return run;
  }

  return {
    async getSettings() {
      return (await read()).settings;
    },
    updateSettings(input) {
      return mutate((db) => (db.settings = { ...input, updatedAt: new Date().toISOString() }));
    },
    saveDraftWithQuotes(draft, quotes) {
      return mutate((db) => {
        prune(db);
        const keep = new Set(quotes.map((q) => q.rateId));
        for (const [id, q] of Object.entries(db.quotes)) {
          if (q.draftId === draft.id && !q.usedAt && !keep.has(id)) delete db.quotes[id];
        }
        db.drafts[draft.id] = { ...draft, createdAt: db.drafts[draft.id]?.createdAt ?? draft.createdAt };
        for (const q of quotes) db.quotes[q.rateId] = q;
      });
    },
    async listDrafts() {
      return Object.values((await read()).drafts)
        .filter(fresh)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 50);
    },
    async getDraft(id) {
      const d = (await read()).drafts[id];
      return d && fresh(d) ? d : null;
    },
    deleteDraft(id) {
      return mutate((db) => {
        delete db.drafts[id];
        for (const [qid, q] of Object.entries(db.quotes)) if (q.draftId === id && !q.usedAt) delete db.quotes[qid];
      });
    },
    claimQuote(rateId) {
      return mutate((db): ClaimResult => {
        const quote = db.quotes[rateId];
        const problem = checkQuote(quote);
        if (problem) return problem;
        quote.usedAt = new Date().toISOString();
        return { quote };
      });
    },
    releaseQuote(rateId) {
      return mutate((db) => {
        if (db.quotes[rateId]) db.quotes[rateId].usedAt = null;
      });
    },
    addShipment(record) {
      return mutate((db) => {
        db.shipments.unshift(record);
      });
    },
    async listShipments() {
      return (await read()).shipments;
    },
    async getLoginAttempts(keys) {
      const all = (await read()).loginAttempts;
      return Object.fromEntries(keys.filter((k) => all[k]).map((k) => [k, all[k]]));
    },
    addLoginFailure(key) {
      return mutate((db) => {
        const cutoff = Date.now() - ATTEMPTS_KEEP_MS;
        for (const [k, a] of Object.entries(db.loginAttempts)) {
          const last = Math.max(Date.parse(a.updatedAt), a.lockedUntil ? Date.parse(a.lockedUntil) : 0);
          if (last < cutoff) delete db.loginAttempts[k];
        }
        const a = (db.loginAttempts[key] ??= { failures: 0, level: 0, lockedUntil: null, updatedAt: "" });
        a.failures += 1;
        a.updatedAt = new Date().toISOString();
        return { ...a };
      });
    },
    lockLogin(key, seenFailures, lockedUntil) {
      return mutate((db) => {
        const a = db.loginAttempts[key];
        if (!a || a.failures !== seenFailures) return;
        Object.assign(a, { failures: 0, level: a.level + 1, lockedUntil });
      });
    },
    clearLoginAttempts(keys) {
      return mutate((db) => {
        for (const k of keys) delete db.loginAttempts[k];
      });
    },
    async listLockedLogins() {
      const now = Date.now();
      return Object.entries((await read()).loginAttempts)
        .filter(([, a]) => a.lockedUntil && Date.parse(a.lockedUntil) > now)
        .map(([key, a]) => ({ key, lockedUntil: a.lockedUntil!, level: a.level }));
    },
    clearAllLoginAttempts() {
      return mutate((db) => {
        db.loginAttempts = {};
      });
    },
    async getSecurity() {
      return { ...defaultSecurity(), ...(await read()).security };
    },
    updateSecurity(patch) {
      return mutate((db) => (db.security = { ...defaultSecurity(), ...db.security, ...patch }));
    },
    createSession(sess) {
      return mutate((db) => {
        for (const [id, x] of Object.entries(db.sessions)) if (!live(x)) delete db.sessions[id];
        db.sessions[sess.id] = sess;
      });
    },
    async getSession(id) {
      const x = (await read()).sessions[id];
      return x && live(x) ? x : null;
    },
    async listSessions() {
      return Object.values((await read()).sessions)
        .filter(live)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    deleteSession(id) {
      return mutate((db) => {
        delete db.sessions[id];
      });
    },
    deleteOtherSessions(keepId) {
      return mutate((db) => {
        for (const id of Object.keys(db.sessions)) if (id !== keepId) delete db.sessions[id];
      });
    },
    deleteSessionsByRole(role) {
      return mutate((db) => {
        for (const [id, x] of Object.entries(db.sessions)) if (x.role === role) delete db.sessions[id];
      });
    },
    rateLimitHit(key, windowMs) {
      return mutate((db) => {
        const now = Date.now();
        for (const [k, r] of Object.entries(db.rateLimits)) if (r.expiresAt <= now) delete db.rateLimits[k];
        const windowStart = Math.floor(now / windowMs) * windowMs;
        const id = `${key}@${windowStart}`;
        const r = (db.rateLimits[id] ??= { count: 0, expiresAt: windowStart + windowMs });
        r.count += 1;
        return r.count;
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Pick the backend once per server instance.
// ---------------------------------------------------------------------------
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "shipbridge";

// Reuse one client across requests (and across hot reloads in dev) instead of reconnecting each time.
const g = globalThis as unknown as { __sbMongo?: Promise<Db> };
function connect(): Promise<Db> {
  if (!g.__sbMongo) {
    g.__sbMongo = (async () => {
      const client = await new MongoClient(MONGODB_URI!, { maxPoolSize: 5, ignoreUndefined: true /* skip empty optional fields instead of storing null */ }).connect();
      const db = client.db(MONGODB_DB);
      await Promise.all([
        db.collection("quotes").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection("quotes").createIndex({ draftId: 1 }),
        db.collection("drafts").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection("drafts").createIndex({ updatedAt: -1 }),
        db.collection("shipments").createIndex({ createdAt: -1 }),
        db.collection("login_attempts").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection("admin_sessions").createIndex({ expiresAtDate: 1 }, { expireAfterSeconds: 0 }),
        db.collection("rate_limits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      ]);
      return db;
    })().catch((err) => {
      g.__sbMongo = undefined; // retry on the next request
      throw err;
    });
  }
  return g.__sbMongo;
}

let store: Store | undefined;
function db(): Store {
  if (store) return store;
  if (MONGODB_URI) {
    store = mongoStore(connect);
  } else if (process.env.VERCEL) {
    throw new Error("No database configured. Set MONGODB_URI in the Vercel project's environment variables, then redeploy.");
  } else {
    store = fileStore();
  }
  return store;
}

export const getSettings = () => db().getSettings();
export const updateSettings = (input: { percent: number; flatFee: number }) => db().updateSettings(input);
export const saveDraftWithQuotes = (draft: Draft, quotes: Quote[]) => db().saveDraftWithQuotes(draft, quotes);
export const listDrafts = () => db().listDrafts();
export const getDraft = (id: string) => db().getDraft(id);
export const deleteDraft = (id: string) => db().deleteDraft(id);
export const claimQuote = (rateId: string) => db().claimQuote(rateId);
export const releaseQuote = (rateId: string) => db().releaseQuote(rateId);
export const addShipment = (record: ShipmentRecord) => db().addShipment(record);
export const listShipments = () => db().listShipments();
export const getLoginAttempts = (keys: string[]) => db().getLoginAttempts(keys);
export const addLoginFailure = (key: string) => db().addLoginFailure(key);
export const lockLogin = (key: string, seenFailures: number, lockedUntil: string) => db().lockLogin(key, seenFailures, lockedUntil);
export const clearLoginAttempts = (keys: string[]) => db().clearLoginAttempts(keys);
export const listLockedLogins = () => db().listLockedLogins();
export const clearAllLoginAttempts = () => db().clearAllLoginAttempts();
export const getSecurity = () => db().getSecurity();
export const updateSecurity = (patch: Partial<SecuritySettings>) => db().updateSecurity(patch);
export const createSession = (s: AdminSession) => db().createSession(s);
export const getSession = (id: string) => db().getSession(id);
export const listSessions = () => db().listSessions();
export const deleteSession = (id: string) => db().deleteSession(id);
export const deleteOtherSessions = (keepId?: string) => db().deleteOtherSessions(keepId);
export const rateLimitHit = (key: string, windowMs: number) => db().rateLimitHit(key, windowMs);
export const deleteSessionsByRole = (role: Role) => db().deleteSessionsByRole(role);
