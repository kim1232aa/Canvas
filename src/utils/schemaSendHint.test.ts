import {describe,expect,it} from 'vitest';
import {
  canvasFieldMatchesSchema,
  isSchemaDrivenProvider,
  isSchemaFieldsOnlyEnabled,
  isSchemaOmitCandidate,
  readDeclaredSchemaProperties,
} from './schemaSendHint';

const fluxProps = {
  prompt: {},
  seed: {},
  steps: {},
  width: {},
  height: {},
  guidance_scale: {},
  strength: {},
  styles: {},
};

describe('schemaSendHint', () => {
  it('recognizes schema-driven providers', () => {
    expect(isSchemaDrivenProvider('wavespeed')).toBe(true);
    expect(isSchemaDrivenProvider('krea')).toBe(true);
    expect(isSchemaDrivenProvider('fal')).toBe(false);
  });

  it('defaults schemaFieldsOnly to enabled when JSON missing or invalid', () => {
    expect(isSchemaFieldsOnlyEnabled(undefined)).toBe(true);
    expect(isSchemaFieldsOnlyEnabled('{"_canvas":{"schemaFieldsOnly":false}}')).toBe(false);
  });

  it('never fakes 不会发送 without declared Schema properties', () => {
    expect(isSchemaOmitCandidate('krea', 'steps')).toBe(false);
    expect(isSchemaOmitCandidate('krea', 'cfg')).toBe(false);
    expect(isSchemaOmitCandidate('wavespeed', 'steps')).toBe(false);
  });

  it('Krea flux-1-dev: steps/seed/cfg/width/height/denoise match Schema — not omit', () => {
    const custom = JSON.stringify({ _canvas: { schemaProperties: Object.keys(fluxProps) } });
    expect(isSchemaOmitCandidate('krea', 'steps', custom)).toBe(false);
    expect(isSchemaOmitCandidate('krea', 'seed', custom)).toBe(false);
    expect(isSchemaOmitCandidate('krea', 'cfg', custom)).toBe(false); // → guidance_scale
    expect(isSchemaOmitCandidate('krea', 'width', custom)).toBe(false);
    expect(isSchemaOmitCandidate('krea', 'height', custom)).toBe(false);
    expect(isSchemaOmitCandidate('krea', 'denoise', custom)).toBe(false); // → strength
    expect(canvasFieldMatchesSchema('cfg', fluxProps)).toBe(true);
  });

  it('Krea flux-1-dev: sampler/scheduler absent from Schema — omit OK', () => {
    const custom = JSON.stringify({ _canvas: { schemaProperties: Object.keys(fluxProps) } });
    expect(isSchemaOmitCandidate('krea', 'sampler', custom)).toBe(true);
    expect(isSchemaOmitCandidate('krea', 'scheduler', custom)).toBe(true);
  });

  it('reads schemaProperties from custom_parameters._canvas', () => {
    expect(readDeclaredSchemaProperties(JSON.stringify({ _canvas: { schemaProperties: ['steps', 'seed'] } }))).toEqual(
      new Set(['steps', 'seed']),
    );
  });

  it('Krea flux-1-dev: loras/styles match Schema — not omit', () => {
    const custom = JSON.stringify({ _canvas: { schemaProperties: Object.keys(fluxProps) } });
    expect(isSchemaOmitCandidate('krea', 'loras', custom)).toBe(false);
    expect(isSchemaOmitCandidate('krea', 'styles', custom)).toBe(false);
    expect(canvasFieldMatchesSchema('loras', fluxProps)).toBe(true);
  });

  it('schemaFieldsOnly false disables omit badges', () => {
    const custom = JSON.stringify({ _canvas: { schemaFieldsOnly: false, schemaProperties: Object.keys(fluxProps) } });
    expect(isSchemaOmitCandidate('krea', 'sampler', custom)).toBe(false);
  });
});
