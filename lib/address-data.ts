import "server-only";
import { promises as fs } from "fs";
import path from "path";

// Server-side access to the same city/ZIP data the browser loads from /public.
const PUBLIC = path.join(process.cwd(), "public");
const cache = new Map<string, Promise<unknown>>();

function readJson<T>(rel: string): Promise<T | null> {
  if (!cache.has(rel)) {
    cache.set(
      rel,
      fs
        .readFile(path.join(PUBLIC, rel), "utf8")
        .then((t) => JSON.parse(t))
        .catch(() => null),
    );
  }
  return cache.get(rel) as Promise<T | null>;
}

/** ZIP -> [state, city], or null if unknown. */
export async function lookupZip(zip: string): Promise<{ state: string; city: string } | null> {
  const z = zip.slice(0, 5);
  if (!/^\d{5}$/.test(z)) return null;
  const map = await readJson<Record<string, [string, string]>>(`us-zips/${z.slice(0, 3)}.json`);
  const hit = map?.[z];
  return hit ? { state: hit[0], city: hit[1] } : null;
}

/** The city's spelling in our list for that state (case/spacing-insensitive), or null. */
export async function canonicalCity(state: string, city: string): Promise<string | null> {
  if (!/^[A-Z]{2}$/.test(state) || !city) return null;
  const map = await readJson<Record<string, string[]>>(`us-cities/${state}.json`);
  if (!map) return null;
  const want = city.trim().toLowerCase().replace(/\s+/g, " ").replace(/^st\.? /, "saint ");
  for (const name of Object.keys(map)) {
    const n = name.toLowerCase().replace(/^st\.? /, "saint ");
    if (n === want) return name;
  }
  return null;
}
