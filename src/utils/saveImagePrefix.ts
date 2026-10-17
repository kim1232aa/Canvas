/** SaveImage filename_prefix from the provider + model that produced the image. Same rule for live runs and 应用到画布. */
export function saveImagePrefixFor(provider: string | undefined, model: string | undefined, current?: string): string {
  const prov = String(provider || '');
  const cleanModel = String(model || '').split('/').pop()?.replace(/[^a-zA-Z0-9_-]/g, '_') || '';
  const cleanProv = prov ? prov.charAt(0).toUpperCase() + prov.slice(1) : '';
  return cleanModel ? `${cleanProv ? cleanProv + '_' : ''}${cleanModel}` : cleanProv || current || 'ComfyCanvas';
}
