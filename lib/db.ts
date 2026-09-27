import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { MarginSettings, Quote, ShipmentRecord } from "./types";

/**
 * Tiny JSON-file store. Good for local use or a single server/VPS.
 * On serverless hosts (e.g. Vercel) the filesystem is not persistent —
 * swap these functions for a real database (Postgres, Redis, etc.).
 */

type DB = {
  settings: MarginSettings;
  quotes: Record<string, Quote>;
  shipments: ShipmentRecord[];
};

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
const DB_FILE = path.join(DATA_DIR, "shipbridge.json");

/** Quotes are only purchasable for this long after rates are fetched. */
export const QUOTE_TTL_MS = 60 * 60 * 1000;

function defaults(): DB {
  return {
    settings: {
      percent: Number(process.env.DEFAULT_MARGIN_PERCENT ?? 15),
      flatFee: Number(process.env.DEFAULT_FLAT_FEE ?? 0),
      updatedAt: null,
    },
    quotes: {},
    shipments: [],
  };
}

async function read(): Promise<DB> {
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    return { ...defaults(), ...JSON.parse(raw) };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return defaults();
    throw err;
  }
}

async function write(db: DB) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, DB_FILE);
}

// Serialize all writes so concurrent requests can't clobber each other.
let queue: Promise<unknown> = Promise.resolve();
function mutate<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const db = await read();
    const result = await fn(db);
    await write(db);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

// ---- Settings ----
export async function getSettings(): Promise<MarginSettings> {
  return (await read()).settings;
}

export function updateSettings(input: { percent: number; flatFee: number }) {
  return mutate((db) => {
    db.settings = { ...input, updatedAt: new Date().toISOString() };
    return db.settings;
  });
}

// ---- Quotes ----
export function saveQuotes(quotes: Quote[]) {
  return mutate((db) => {
    const cutoff = Date.now() - QUOTE_TTL_MS * 24;
    for (const [id, q] of Object.entries(db.quotes)) {
      if (Date.parse(q.createdAt) < cutoff) delete db.quotes[id];
    }
    for (const q of quotes) db.quotes[q.rateId] = q;
  });
}

/** Atomically claims a quote for purchase. Returns the quote, or a reason it can't be used. */
export function claimQuote(rateId: string) {
  return mutate((db): { quote: Quote } | { error: string; status: number } => {
    const quote = db.quotes[rateId];
    if (!quote) return { error: "This rate is no longer available. Get rates again.", status: 404 };
    if (quote.usedAt) return { error: "A label was already bought with this rate.", status: 409 };
    if (Date.now() - Date.parse(quote.createdAt) > QUOTE_TTL_MS)
      return { error: "This rate has expired. Get rates again.", status: 410 };
    quote.usedAt = new Date().toISOString();
    return { quote };
  });
}

export function releaseQuote(rateId: string) {
  return mutate((db) => {
    if (db.quotes[rateId]) db.quotes[rateId].usedAt = null;
  });
}

// ---- Shipments ----
export function addShipment(record: ShipmentRecord) {
  return mutate((db) => {
    db.shipments.unshift(record);
  });
}

export async function listShipments(): Promise<ShipmentRecord[]> {
  return (await read()).shipments;
}
