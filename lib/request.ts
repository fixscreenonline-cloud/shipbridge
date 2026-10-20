import "server-only";
import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { rateLimitHit } from "./db";

/**
 * The client's IP. On Vercel these headers are set by the platform (client-sent values are replaced),
 * so they can be trusted there. Behind another host, make sure its proxy overwrites them too.
 */
export function clientIp(req: Request) {
  return req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}

/** IPs are hashed before storing, so raw addresses aren't kept. */
export const hashIp = (ip: string) => createHash("sha256").update(ip).digest("hex").slice(0, 32);

export class BodyError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Reads a JSON body, refusing anything larger than `maxBytes` (stops memory-exhaustion requests). */
export async function readJson(req: Request, maxBytes = 16 * 1024): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new BodyError("Request is too large.", 413);
  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BodyError("Request is too large.", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Allows `limit` requests per `windowMs` per client IP for a named action.
 * Returns a 429 response when over the limit, otherwise null.
 */
export async function rateLimit(req: Request, action: string, limit: number, windowMs: number) {
  const count = await rateLimitHit(`${action}:${hashIp(clientIp(req))}`, windowMs);
  if (count <= limit) return null;
  return NextResponse.json(
    { error: "Too many requests. Please wait a few minutes and try again." },
    { status: 429, headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) } },
  );
}

/** Only http(s) links may be stored or opened (no javascript:, data:, etc.). */
export function safeHttpUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
