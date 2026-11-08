// ModelScope API-Inference /v1/images/generations `loras` field:
// Official examples use repository IDs (owner/model) or {"<id>": weight}, but custom user
// strings are forwarded verbatim so upstream decides without local false blocking.
const REPO_ID = /^[^/\s]+\/[^/\s]+$/;

/** Pick ModelScope LoRA identifier from a canvas LoRA row. Prefer repo-id-shaped name/id over residual HTTPS downloadUrl when both exist; otherwise pass user string verbatim. */
function modelScopeRepoId(l: any): string {
  if (l == null || typeof l !== 'object') return String(l ?? '').trim();
  if ('path_or_id' in l && !('name' in l) && !('id' in l)) {
    throw new Error('魔搭 LoRA 不接受 path_or_id/weight 形状；请用仓库 ID（owner/model）或 {"owner/model": weight}');
  }
  const candidates = [l.id, l.name, l.path, l.url, l.downloadUrl];
  for (const c of candidates) {
    const s = String(c ?? '').trim();
    if (REPO_ID.test(s)) return s;
  }
  return String(l.name ?? l.id ?? l.path ?? l.url ?? l.downloadUrl ?? '').trim();
}

export function buildModelScopeLoras(input: unknown): string | Record<string, number> | undefined {
  if (input === undefined || input === null || (Array.isArray(input) && !input.length)) return undefined;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    return trimmed ? input : undefined;
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
  for (const [id] of pairs) {
    if (!id || !id.trim()) {
      throw new Error('魔搭 LoRA 标识不能为空');
    }
  }
  return Object.fromEntries(pairs);
}
