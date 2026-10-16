/**
 * Count LoRAs actually carried by a generation's actualRequest (server echo of what
 * was sent upstream). Generic: any array under a key containing "lora"
 * (loras / image_loras / lora_list / …) counts; the mapping/omitted diagnostics are skipped.
 */
const SKIP = new Set(['mapping', 'omitted', 'omissions', 'inputSchema', 'schema']);

export function findActualRequest(value: unknown, depth = 0): unknown {
  if (!value || typeof value !== 'object' || depth > 6) return undefined;
  const obj = value as Record<string, unknown>;
  if (obj.actualRequest && typeof obj.actualRequest === 'object') return obj.actualRequest;
  for (const [k, v] of Object.entries(obj)) {
    if (SKIP.has(k) || k === 'rawResponse') continue;
    const hit = findActualRequest(v, depth + 1);
    if (hit) return hit;
  }
  return undefined;
}

export function countActualRequestLoras(actualRequest: unknown, depth = 0): number {
  if (!actualRequest || typeof actualRequest !== 'object' || depth > 6) return 0;
  let max = 0;
  for (const [k, v] of Object.entries(actualRequest as Record<string, unknown>)) {
    if (SKIP.has(k)) continue;
    if (/lora/i.test(k) && Array.isArray(v)) max = Math.max(max, v.filter((x) => x !== null && x !== undefined && x !== '').length);
    else if (/lora/i.test(k) && v && typeof v === 'object') max = Math.max(max, Object.keys(v).length); // object map {name: strength}
    else if (v && typeof v === 'object' && !Array.isArray(v)) max = Math.max(max, countActualRequestLoras(v, depth + 1));
    // Nested step/stage lists (e.g. input.steps[].arguments.loras + loraStrengths): recurse into object elements.
    else if (Array.isArray(v)) for (const x of v) if (x && typeof x === 'object' && !Array.isArray(x)) max = Math.max(max, countActualRequestLoras(x, depth + 1));
  }
  return max;
}
