import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFalInputProperties } from '../falImageContract';

const here = dirname(fileURLToPath(import.meta.url));

export function loadCivitaiImageGenOpenApi(): unknown {
  return JSON.parse(readFileSync(join(here, 'civitai-imageGen-openapi.json'), 'utf8'));
}

export function loadFalLiveProps(endpointId: string): Record<string, unknown> {
  const file = `fal-openapi-${endpointId.replace(/\//g, '__')}.json`;
  const doc = JSON.parse(readFileSync(join(here, file), 'utf8'));
  const props = extractFalInputProperties(doc);
  if (!props) throw new Error(`fixture missing Input props for ${endpointId}`);
  return props;
}

/** Synthetic live props for Fal video unit tests (no network). */
export function falVideoProps(partial: Record<string, unknown>): Record<string, unknown> {
  return { prompt: { type: 'string' }, ...partial };
}
