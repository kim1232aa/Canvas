// Verified against ModelScope API-Inference AIGC example comments
// (https://www.modelscope.cn/docs/model-service/API-Inference/intro and the Z-Image-Turbo
// images/generations sample): LoRA IDs are ModelScope repository IDs (owner/model);
// multiple LoRA weights must sum to 1.0; up to 6 LoRAs. Do not auto-rescale weights.
const REPO_ID = /^[^/\s]+\/[^/\s]+$/;

/** Pick ModelScope repository id from a canvas LoRA row. Prefer name/id over path/url (path may be HTTPS). */
function modelScopeRepoId(l: any): string {
  if (l == null || typeof l !== 'object') return String(l ?? '');
  if ('path_or_id' in l && !('name' in l) && !('id' in l)) {
    throw new Error('魔搭 LoRA 不接受 path_or_id/weight 形状；请用仓库 ID（owner/model）或 {"owner/model": weight}');
  }
  const candidates = [l.id, l.name, l.path, l.url, l.downloadUrl];
  for (const c of candidates) {
    const s = String(c ?? '').trim();
    if (REPO_ID.test(s)) return s;
  }
  // Fall back so the existing validation can throw a clear 仓库 ID error (never send HTTPS path as id).
  return String(l.name || l.id || l.path || '').trim();
}

export function buildModelScopeLoras(input: unknown): string | Record<string, number> | undefined {
  if (input === undefined || input === null || (Array.isArray(input) && !input.length)) return undefined;
  if (typeof input === 'string') {
    if (!REPO_ID.test(input)) {
      throw new Error(
        `魔搭 LoRA 必须为仓库 ID（owner/model），不能使用通用 HTTPS 权重 URL 或文件名；收到: ${input}`
      );
    }
    return input;
  }
  let pairs: Array<[string, number]>;
  if (Array.isArray(input)) {
    pairs = input.map((l) => [
      modelScopeRepoId(l),
      Number(l.strength ?? l.modelStrength ?? l.weight ?? l.scale),
    ]);
  } else if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    if ('path_or_id' in obj || ('path' in obj && 'scale' in obj && !('name' in obj) && Object.keys(obj).every((k) => ['path', 'scale', 'url', 'weight'].includes(k)))) {
      throw new Error('魔搭上游字段只要 loras（仓库 ID 或 {id:weight}），禁止 path/scale 或 path_or_id/weight');
    }
    pairs = Object.entries(obj).map(([id, weight]) => [id, Number(weight)]);
  } else throw new Error('LoRA 必须为仓库 ID、权重映射或 LoRA 数组');
  if (!pairs.length) throw new Error('LoRA 为空');
  if (new Set(pairs.map(([id]) => id)).size !== pairs.length) throw new Error('魔搭 LoRA 仓库 ID 不能重复');
  for (const [id, weight] of pairs) {
    if (!id || !REPO_ID.test(id)) {
      throw new Error(
        `魔搭 LoRA 必须为仓库 ID（owner/model），不能使用通用 HTTPS 权重 URL 或文件名；收到 path/name: ${id || '(空)'}`
      );
    }
  }
  return Object.fromEntries(pairs);
}
