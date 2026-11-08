import { describe, it, expect } from 'vitest';
import {
  applyNsfwDefaultsToPayload,
  applyNsfwDefaultsToCustomParameters,
  OFFICIAL_NSFW_FIELD_POLICIES,
} from './nsfw';
import { buildModelScopeLoras } from '../schemas/modelScopeLoras';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { SchemaChoiceControls } from '../components/SchemaChoiceControls';
import { CivitaiAllowMatureControl } from '../components/ParameterInspector';

describe('NSFW permissive defaults (AGENTS.md #6): UI seeds visible defaults, backend no longer supplements omitted fields', () => {
  it('audits explicitly set permissive values but does not mutate the payload', () => {
    const payload: Record<string, any> = {
      prompt: 'a red fox sitting on a stone wall at dusk',
      disable_safety_checker: true,
    };
    const schemaProps = {
      prompt: { type: 'string' },
      disable_safety_checker: { type: 'boolean', default: false },
    };

    const applied = applyNsfwDefaultsToPayload(payload, schemaProps);

    expect(payload).toEqual({
      prompt: 'a red fox sitting on a stone wall at dusk',
      disable_safety_checker: true,
    });
    expect(applied).toEqual([
      {
        field: 'disable_safety_checker',
        value: true,
        docUrl: OFFICIAL_NSFW_FIELD_POLICIES.disable_safety_checker.docUrl,
        description: OFFICIAL_NSFW_FIELD_POLICIES.disable_safety_checker.description,
      },
    ]);
  });

  it('never overwrites a value the user explicitly set (including restrictive values)', () => {
    const payload: Record<string, any> = {
      prompt: 'a red fox sitting on a stone wall at dusk',
      disable_safety_checker: false,
      enable_safety_checker: true,
      safety_tolerance: '2',
    };
    const schemaProps = {
      prompt: { type: 'string' },
      disable_safety_checker: { type: 'boolean', default: false },
      enable_safety_checker: { type: 'boolean', default: true },
      safety_tolerance: { type: 'string', default: '2' },
    };

    const applied = applyNsfwDefaultsToPayload(payload, schemaProps);

    expect(payload.disable_safety_checker).toBe(false);
    expect(payload.enable_safety_checker).toBe(true);
    expect(payload.safety_tolerance).toBe('2');
    expect(applied).toEqual([]);
  });

  it('omitted fields stay omitted - backend no longer supplements', () => {
    const venice: Record<string, any> = { prompt: 'portrait of a red fox' };
    const fal: Record<string, any> = { prompt: 'portrait of a red fox' };

    const veniceApplied = applyNsfwDefaultsToPayload(venice, {
      safe_mode: { type: 'boolean', default: true },
      moderation: { type: 'string', default: 'auto' },
    });
    const falApplied = applyNsfwDefaultsToPayload(fal, {
      enable_safety_checker: { type: 'boolean', default: true },
      safety_tolerance: { type: 'string', default: '2' },
    });

    expect(venice).toEqual({ prompt: 'portrait of a red fox' });
    expect(veniceApplied).toEqual([]);

    expect(fal).toEqual({ prompt: 'portrait of a red fox' });
    expect(falApplied).toEqual([]);
  });

  it('does not fabricate safety fields that are not in the live schema or are unverified', () => {
    const payload: Record<string, any> = { prompt: 'x' };
    const applied = applyNsfwDefaultsToPayload(payload, {
      prompt: { type: 'string' },
      checkNSFW: { type: 'boolean' },
      safety_checker: { type: 'string' },
    });
    expect(applied).toEqual([]);
    expect(payload).toEqual({ prompt: 'x' });
    expect(applyNsfwDefaultsToPayload({ prompt: 'x' }, undefined)).toEqual([]);
    expect(applyNsfwDefaultsToPayload(undefined as any, { safe_mode: {} })).toEqual([]);
  });

  it('applyNsfwDefaultsToCustomParameters seeds declared permissive defaults while preserving user keys', () => {
    const schemaProps = {
      enable_safety_checker: { type: 'boolean', default: true },
      safety_tolerance: { type: 'string', default: '2' },
    };
    const seeded = JSON.parse(applyNsfwDefaultsToCustomParameters(JSON.stringify({ steps: 28 }), schemaProps));
    expect(seeded).toEqual({
      steps: 28,
      enable_safety_checker: false,
      safety_tolerance: '5',
    });

    const userOverridden = JSON.stringify({ enable_safety_checker: true, safety_tolerance: '1', steps: 20 });
    expect(JSON.parse(applyNsfwDefaultsToCustomParameters(userOverridden, schemaProps))).toEqual({
      enable_safety_checker: true,
      safety_tolerance: '1',
      steps: 20,
    });
  });

  it('SchemaChoiceControls and CivitaiAllowMatureControl publicly pre-fill permissive defaults when unset', () => {
    const html = renderToStaticMarkup(
      React.createElement(SchemaChoiceControls, {
        inputSchema: {
          properties: {
            enable_safety_checker: { type: 'boolean', default: true },
            safety_tolerance: { type: 'string', enum: ['1', '2', '3', '4', '5'], default: '2' },
          },
        },
        value: '{}',
        onChange: () => {},
      })
    );
    expect(html).toContain('会发送 false');
    expect(html).toContain('会发送 5');
    expect(html).toContain('（不发送）');

    const civHtml = renderToStaticMarkup(
      React.createElement(CivitaiAllowMatureControl, {
        customParameters: '{}',
        onChangeCustom: () => {},
      })
    );
    expect(civHtml).toContain('会发送 true');
    expect(civHtml).toContain('（不发送）');
  });

  it('buildModelScopeLoras passes custom user strings through verbatim without owner/model regex rejection', () => {
    expect(buildModelScopeLoras('custom-single-token-lora')).toBe('custom-single-token-lora');
    expect(buildModelScopeLoras('org/sub/custom-lora-v2')).toBe('org/sub/custom-lora-v2');
    expect(buildModelScopeLoras([{ name: 'custom-lora-name', strength: 0.8 }])).toEqual({
      'custom-lora-name': 0.8,
    });
    expect(buildModelScopeLoras({ 'my_custom_lora.safetensors': 0.75 })).toEqual({
      'my_custom_lora.safetensors': 0.75,
    });
  });
});
