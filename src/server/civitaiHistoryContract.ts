export function civitaiImageHistory(submitted: Record<string, any>, effective?: Record<string, any>) {
  const actual = { ...submitted, ...effective };
  const number = (key: string) => actual[key] !== undefined && actual[key] !== null && actual[key] !== '' ? Number(actual[key]) : null;
  return {
    prompt: actual.prompt,
    negativePrompt: actual.negativePrompt,
    model: actual.diffuserModel ?? actual.diffusionModel ?? actual.model,
    seed: number('seed'), steps: number('steps'), cfg: number('cfgScale'),
    sampler: actual.sampleMethod ?? actual.sampler ?? null,
    scheduler: actual.schedule ?? actual.scheduler ?? null,
    width: number('width'), height: number('height'),
    loras: Array.isArray(actual.loras)
      ? actual.loras.map((lora: Record<string, any>) => ({ name: lora.air, strength: Number(lora.strength) }))
      : Object.entries(actual.loras ?? {}).map(([name, strength]) => ({ name, strength: Number(strength) })),
  };
}
