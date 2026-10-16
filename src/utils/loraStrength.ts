/**
 * Explicit LoRA strength helpers.
 * Iron rule: never invent 0.8 / 1.0 when the user or node left strength empty.
 * Finite 0 is a valid explicit strength and must be preserved.
 */

export const MISSING_LORA_STRENGTH_MSG =
  '缺少显式 LoRA 强度 (strength_model / strength)，禁止静默兜底 0.8';

/** Parse a strength field: missing/empty → undefined; finite number (incl. 0) → number. */
export function parseExplicitLoraStrength(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export type LoraStrengthFields = {
  name?: string;
  modelStrength?: number;
  clipStrength?: number;
  strength?: number;
};

/** True when a named LoRA has no explicit model/clip/generic strength. */
export function loraMissingExplicitStrength(lora: LoraStrengthFields): boolean {
  const name = String(lora.name ?? '').trim();
  if (!name) return false;
  return (
    parseExplicitLoraStrength(lora.modelStrength) === undefined &&
    parseExplicitLoraStrength(lora.clipStrength) === undefined &&
    parseExplicitLoraStrength(lora.strength) === undefined
  );
}

/** Throw if any named LoRA is missing explicit strength (used before upstream submit). */
export function assertExplicitLoraStrengths(
  loras: LoraStrengthFields[],
  label = 'LoRA'
): void {
  for (const l of loras) {
    const name = String(l.name ?? '').trim();
    if (!name) continue;
    if (loraMissingExplicitStrength(l)) {
      throw new Error(`${label} [${name}] ${MISSING_LORA_STRENGTH_MSG}`);
    }
  }
}
