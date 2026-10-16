// Verified against ModelScope API-Inference AIGC example comments
// (https://www.modelscope.cn/docs/model-service/API-Inference/intro and the Z-Image-Turbo
// images/generations sample): LoRA IDs are ModelScope repository IDs (owner/model);
// multiple LoRA weights must sum to 1.0; up to 6 LoRAs. Do not auto-rescale weights.
export function buildModelScopeLoras(input: unknown): string | Record<string, number> | undefined {
  if (input === undefined || input === null || (Array.isArray(input) && !input.length)) return undefined;
  if (typeof input === 'string') {
    if (!/^[^/\s]+\/[^/\s]+$/.test(input)) {
      throw new Error(
        `魔搭 LoRA 必须为仓库 ID（owner/model），不能使用通用 HTTPS 权重 URL 或文件名；收到: ${input}`
      );
    }
    return input;
  }
  let pairs: Array<[string, number]>;
  if (Array.isArray(input)) pairs = input.map(l => [String(l.path || l.name || ''), Number(l.strength ?? l.modelStrength ?? l.scale)]);
  else if (typeof input === 'object') pairs = Object.entries(input as Record<string, unknown>).map(([id, weight]) => [id, Number(weight)]);
  else throw new Error('LoRA 必须为仓库 ID、权重映射或 LoRA 数组');
  if (!pairs.length || pairs.length > 6) throw new Error('魔搭 LoRA 数量必须为 1–6');
  if (new Set(pairs.map(([id]) => id)).size !== pairs.length) throw new Error('魔搭 LoRA 仓库 ID 不能重复');
  for (const [id, weight] of pairs) {
    if (!id || !/^[^/\s]+\/[^/\s]+$/.test(id)) {
      throw new Error(
        `魔搭 LoRA 必须为仓库 ID（owner/model），不能使用通用 HTTPS 权重 URL 或文件名；收到 path/name: ${id || '(空)'}`
      );
    }
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) {
      throw new Error(`魔搭 LoRA 权重必须为 0–1；字段 ${id} 收到: ${weight}`);
    }
  }
  const sum = pairs.reduce((acc, [, weight]) => acc + weight, 0);
  if (Math.abs(sum - 1) > 1e-6) {
    const detail = pairs.map(([id, w]) => `${id}=${w}`).join(', ');
    throw new Error(
      `魔搭 LoRA 权重之和必须恰好为 1.0（官方 API-Inference 约束），不会自动改权重；当前合计=${sum}（${detail}）`
    );
  }
  return Object.fromEntries(pairs);
}
