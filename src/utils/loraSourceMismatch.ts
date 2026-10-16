/**
 * LoRA node provenance vs the provider that will run it (generic, every provider).
 * `resource_source` holds the provider id the LoRA was picked from (e.g. "modelscope_ai") or a descriptive string;
 * only a bare provider id is compared — descriptive / URL sources are never guessed. Nothing is cleared or rewritten.
 */
export function loraSourceMismatch(resourceSource: unknown, currentProvider: unknown, baseModel?: unknown): string | null {
  const src = typeof resourceSource === 'string' ? resourceSource.trim() : '';
  const cur = typeof currentProvider === 'string' ? currentProvider.trim() : '';
  if (!src || !cur || !/^[a-z0-9_-]+$/i.test(src)) return null;
  if (src.toLowerCase() === cur.toLowerCase()) return null;
  const base = typeof baseModel === 'string' && baseModel.trim() ? `，底模信息 ${baseModel.trim()} 也来自 ${src}` : '';
  return `LoRA 来源 ${src} 与当前生成供应商 ${cur} 不同${base}；这些信息未按 ${cur} 核实，仅作来源记录（未自动清除）。`;
}
