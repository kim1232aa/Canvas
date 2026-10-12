export function collectCivitaiImageOutputs(data: any): Array<{ url: string; seed?: number }> {
  const result = new Map<string, { url: string; seed?: number }>();
  const append = (images: unknown) => {
    if (!Array.isArray(images)) return;
    for (const image of images) {
      const url = typeof image === 'string' ? image : image?.url || image?.blobUrl;
      if (typeof url !== 'string' || !url || result.has(url)) continue;
      result.set(url, { url, ...(typeof image?.seed === 'number' ? { seed: image.seed } : {}) });
    }
  };
  for (const step of data?.steps || []) {
    append(step.output?.images);
    append(step.output?.blobs);
    for (const job of step.jobs || []) {
      append(job.result?.images);
      append(job.result?.blobs);
      if (job.result?.blobUrl) append([job.result.blobUrl]);
    }
  }
  append(data?.images);
  append(data?.output?.blobs);
  append(data?.blobs);
  if (!result.size && (data?.url || data?.blobUrl)) append([data.url || data.blobUrl]);
  return [...result.values()];
}
