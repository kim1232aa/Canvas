/** Add the Gemini image-generation output modality unless the caller supplied one. */
export function withGeminiImageResponseModality(config: Record<string, any>): Record<string, any> {
  if (config.responseModalities !== undefined) return config;
  return { ...config, responseModalities: ['IMAGE'] };
}
