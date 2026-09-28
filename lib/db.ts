import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { MongoClient, type Db } from "mongodb";
import type { MarginSettings, Quote, ShipmentRecord } from "./types";

/**
 * Storage for settings, quotes and shipments.
 *
 * - With MONGODB_URI set (e.g. MongoDB Atlas), data lives in MongoDB. Required on Vercel/serverless,
 *   where the filesystem is read-only.
 * - Otherwise it falls back to a JSON file in DATA_DIR, which is fine for local development.
 */

/** Quotes are only purchasable for this long after rates are fetched. */
export const QUOTE_TTL_MS = 60 * 60 * 1000;
/** Old quotes are kept a while for reference, then dropped. */
const QUOTE_KEEP_MS = QUOTE_TTL_MS * 24;

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

type Store = {
  getSettings(): Promise<MarginSettings>;
  updateSettings(input: { percent: number; flatFee: number }): Promise<MarginSettings>;
  saveQuotes(quotes: Quote[]): Promise<void>;
  /** Atomically claims a quote for purchase. Returns the quote, or a reason it can't be used. */
  claimQuote(rateId: string): Promise<ClaimResult>;
  releaseQuote(rateId: string): Promise<void>;
  addShipment(record: ShipmentRecord): Promise<void>;
  listShipments(): Promise<ShipmentRecord[]>;
};

// ---------------------------------------------------------------------------
// MongoDB
// ---------------------------------------------------------------------------
type QuoteDoc = Quote & { _id: string; expiresAt: Date };
type ShipmentDoc = ShipmentRecord & { _id: string };
type SettingsDoc = MarginSettings & { _id: string };

function mongoStore(getDb: () => Promise<Db>): Store {
  const col = async () => {
    const db = await getDb();
    return {
      settings: db.collection<SettingsDoc>("settings"),
      quotes: db.collection<QuoteDoc>("quotes"),
      shipments: db.collection<ShipmentDoc>("shipments"),
    };
  };
  const strip = <T extends { _id: string }>({ _id, ...rest }: T) => rest;
  const quoteOnly = ({ _id, expiresAt, ...q }: QuoteDoc): Quote => q;

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
    async saveQuotes(quotes) {
      if (!quotes.length) return;
      // MongoDB deletes each quote once expiresAt passes (TTL index created in connect()).
      await (await col()).quotes.bulkWrite(
        quotes.map((q) => ({
          replaceOne: {
            filter: { _id: q.rateId },
            replacement: { ...q, expiresAt: new Date(Date.parse(q.createdAt) + QUOTE_KEEP_MS) },
            upsert: true,
          },
        })),
      );
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
  };
}

// ---------------------------------------------------------------------------
// JSON file (local development)
// ---------------------------------------------------------------------------
type FileDB = { settings: MarginSettings; quotes: Record<string, Quote>; shipments: ShipmentRecord[] };

function fileStore(): Store {
  const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
  const DB_FILE = path.join(DATA_DIR, "shipbridge.json");
  const empty = (): FileDB => ({ settings: defaultSettings(), quotes: {}, shipments: [] });

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
    saveQuotes(quotes) {
      return mutate((db) => {
        const cutoff = Date.now() - QUOTE_KEEP_MS;
        for (const [id, q] of Object.entries(db.quotes)) if (Date.parse(q.createdAt) < cutoff) delete db.quotes[id];
        for (const q of quotes) db.quotes[q.rateId] = q;
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
      const client = await new MongoClient(MONGODB_URI!, { maxPoolSize: 5 }).connect();
      const db = client.db(MONGODB_DB);
      await Promise.all([
        db.collection("quotes").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection("shipments").createIndex({ createdAt: -1 }),
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
export const saveQuotes = (quotes: Quote[]) => db().saveQuotes(quotes);
export const claimQuote = (rateId: string) => db().claimQuote(rateId);
export const releaseQuote = (rateId: string) => db().releaseQuote(rateId);
export const addShipment = (record: ShipmentRecord) => db().addShipment(record);
export const listShipments = () => db().listShipments();
