/**
 * Generation ledger: every generated asset (voice, image, sound effect, video) is recorded in
 * `<project>/generations.json` under a key made from what produced it (kind, model, prompt, seed,
 * parameters). Asking for the same generation again returns the recorded file instead of paying
 * for it twice, and `mgvideo cost` adds up what the ledger says was spent.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const GenerationEntrySchema = z.object({
  key: z.string().regex(/^[0-9a-f]{64}$/),
  kind: z.string().min(1),
  model: z.string().min(1),
  prompt: z.string(),
  seed: z.number().int().nullable(),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  /** Output file, relative to the project directory. */
  file: z.string().min(1),
  file_hash: z.string().regex(/^[0-9a-f]{64}$/),
  cost_cents: z.number().nonnegative(),
  created_at: z.string(),
});

export const GenerationLedgerSchema = z.object({
  schema_version: z.literal('1.0.0').default('1.0.0'),
  entries: z.array(GenerationEntrySchema).default([]),
});

export type GenerationEntry = z.infer<typeof GenerationEntrySchema>;
export type GenerationLedger = z.infer<typeof GenerationLedgerSchema>;

export interface GenerationRequest {
  kind: string;
  model: string;
  prompt: string;
  seed?: number | null;
  params?: Record<string, string | number | boolean>;
}

/** Same inputs, same key: parameters are sorted, so their order does not matter. */
export function generationKey(req: GenerationRequest): string {
  const params = Object.fromEntries(Object.entries(req.params ?? {}).sort(([a], [b]) => a.localeCompare(b)));
  const canon = JSON.stringify([req.kind, req.model, req.prompt, req.seed ?? null, params]);
  return crypto.createHash('sha256').update(canon).digest('hex');
}

export function ledgerPath(projectDir: string): string {
  return path.join(projectDir, 'generations.json');
}

export function readLedger(projectDir: string): GenerationLedger {
  const file = ledgerPath(projectDir);
  if (!fs.existsSync(file)) return GenerationLedgerSchema.parse({});
  return GenerationLedgerSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
}

const sha256File = (f: string) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

/**
 * The recorded output for this request, when its file still exists unchanged; null otherwise
 * (never generated, file gone, or file edited since).
 */
export function findGeneration(projectDir: string, req: GenerationRequest): (GenerationEntry & { path: string }) | null {
  const key = generationKey(req);
  const hit = [...readLedger(projectDir).entries].reverse().find(e => e.key === key);
  if (!hit) return null;
  const full = path.resolve(projectDir, hit.file);
  if (!fs.existsSync(full) || sha256File(full) !== hit.file_hash) return null;
  return { ...hit, path: full };
}

/** Records a finished generation. `file` must exist inside the project directory. */
export function recordGeneration(projectDir: string, req: GenerationRequest, file: string, costCents: number): GenerationEntry {
  const full = path.resolve(projectDir, file);
  const rel = path.relative(path.resolve(projectDir), full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Generated file must be inside the project: ${file}`);
  if (!fs.existsSync(full)) throw new Error(`Generated file not found: ${file}`);
  if (!(costCents >= 0)) throw new Error(`Cost must be zero or more cents, got ${costCents}`);
  const entry = GenerationEntrySchema.parse({
    key: generationKey(req), kind: req.kind, model: req.model, prompt: req.prompt, seed: req.seed ?? null,
    params: req.params ?? {}, file: rel.split(path.sep).join('/'), file_hash: sha256File(full), cost_cents: costCents,
    created_at: new Date().toISOString(),
  });
  const ledger = readLedger(projectDir);
  ledger.entries.push(entry);
  fs.writeFileSync(ledgerPath(projectDir), JSON.stringify(ledger, null, 2) + '\n');
  return entry;
}

/** Spend per kind and in total, in cents. */
export function ledgerSpend(ledger: GenerationLedger): { total_cents: number; by_kind: Record<string, number>; count: number } {
  const by_kind: Record<string, number> = {};
  for (const e of ledger.entries) by_kind[e.kind] = (by_kind[e.kind] ?? 0) + e.cost_cents;
  return { total_cents: Object.values(by_kind).reduce((a, b) => a + b, 0), by_kind, count: ledger.entries.length };
}
