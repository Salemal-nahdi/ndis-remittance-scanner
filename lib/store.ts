import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AlertState, Decision } from "./alerts";
import type { UnpaidInvoice } from "./aging";
import type { ContactRecord } from "./duplicates";

/**
 * App state kept in a JSON file. Fine for one business on a server with a
 * persistent disk; swap for a database before hosting on serverless or for
 * several businesses.
 */
export interface Settings {
  defaultThresholdDays: number;
  overrides: Record<string, number>;
  alertEmails: string[];
}

export interface XeroSnapshot {
  syncedAt: string;
  contacts: ContactRecord[];
  invoices: UnpaidInvoice[];
  /** contactId -> number of invoices of any status, for the clean-up screen */
  invoiceCounts: Record<string, number>;
}

export interface StoreData {
  xero?: { tokenSet: string; tenantId: string; tenantName: string };
  snapshot?: XeroSnapshot;
  settings: Settings;
  decisions: Record<string, Decision[]>;
  alertState: Record<string, AlertState>;
  lastAlertRun?: { at: string; date: string; sent: number; error?: string };
  notDuplicates: string[];
}

const DATA_FILE = path.join(process.env.DATA_DIR ?? path.join(process.cwd(), "data"), "store.json");

const DEFAULTS: StoreData = {
  settings: { defaultThresholdDays: 30, overrides: {}, alertEmails: [] },
  decisions: {},
  alertState: {},
  notDuplicates: [],
};

export async function readStore(): Promise<StoreData> {
  try {
    return { ...DEFAULTS, ...JSON.parse(await readFile(DATA_FILE, "utf8")) };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(DEFAULTS);
    throw err;
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** Read-modify-write, serialised so concurrent requests don't overwrite each other. */
export function updateStore<T>(fn: (data: StoreData) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const data = await readStore();
    const result = await fn(data);
    await mkdir(path.dirname(DATA_FILE), { recursive: true });
    const tmp = `${DATA_FILE}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    await rename(tmp, DATA_FILE);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return createHash("sha256").update(secret).digest();
}

/** Encrypts Xero tokens at rest. */
export function seal(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64")).join(".");
}

export function unseal<T>(sealed: string): T {
  const [iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8"));
}
