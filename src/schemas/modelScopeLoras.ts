// Verified against the ModelScope Z-Image-Turbo API-Inference example in this run.
export function buildModelScopeLoras(input: unknown): string | Record<string, number> | undefined {
  if (input === undefined || input === null || (Array.isArray(input) && !input.length)) return undefined;
  if (typeof input === 'string') {
    if (!/^[^/\s]+\/[^/\s]+$/.test(input)) throw new Error('LoRA 必须为魔搭仓库 ID（owner/model），不能使用文件名或 Civitai ID');
    return input;
  }
  let pairs: Array<[string, number]>;
  if (Array.isArray(input)) pairs = input.map(l => [String(l.path || l.name || ''), Number(l.strength ?? l.modelStrength ?? l.scale)]);
  else if (typeof input === 'object') pairs = Object.entries(input as Record<string, unknown>).map(([id, weight]) => [id, Number(weight)]);
  else throw new Error('LoRA 必须为仓库 ID、权重映射或 LoRA 数组');
  if (!pairs.length || pairs.length > 6) throw new Error('魔搭 LoRA 数量必须为 1–6');
  if (new Set(pairs.map(([id]) => id)).size !== pairs.length) throw new Error('魔搭 LoRA 仓库 ID 不能重复');
  for (const [id, weight] of pairs) {
    if (!/^[^/\s]+\/[^/\s]+$/.test(id)) throw new Error(`LoRA 必须为魔搭仓库 ID（owner/model）: ${id}`);
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) throw new Error(`LoRA 权重必须为 0–1: ${id}`);
  }
  if (Math.abs(pairs.reduce((sum, [, weight]) => sum + weight, 0) - 1) > 1e-6) throw new Error('魔搭 LoRA 权重之和必须为 1.0；不会自动改变权重');
  return Object.fromEntries(pairs);
}
