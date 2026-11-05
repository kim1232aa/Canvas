import { describe, it, expect } from 'vitest';
import {
  OFFICIAL_NSFW_FIELD_POLICIES,
  findNsfwPolicy,
  isNsfwField,
  getNsfwPermissiveDefault,
  extractDeclaredNsfwDefaults,
  applyNsfwDefaultsToCustomParameters,
} from './nsfw';

describe('Official NSFW & Safety Policy Grounding', () => {
  it('every official NSFW switch cites its official source URL and permissive value', () => {
    expect(OFFICIAL_NSFW_FIELD_POLICIES.enable_safety_checker).toMatchObject({
      field: 'enable_safety_checker',
      type: 'boolean',
      permissiveValue: false,
      upstreamDefault: true,
      docUrl: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux-lora',
    });

    expect(OFFICIAL_NSFW_FIELD_POLICIES.disable_safety_checker).toMatchObject({
      field: 'disable_safety_checker',
      type: 'boolean',
      permissiveValue: true,
      upstreamDefault: false,
      docUrl: 'https://docs.together.ai/openapi.yaml',
    });

    expect(OFFICIAL_NSFW_FIELD_POLICIES.safe_mode).toMatchObject({
      field: 'safe_mode',
      type: 'boolean',
      permissiveValue: false,
      upstreamDefault: true,
      docUrl: 'https://api.venice.ai/api/v1/swagger.yaml',
    });

    expect(OFFICIAL_NSFW_FIELD_POLICIES.safety_tolerance).toMatchObject({
      field: 'safety_tolerance',
      type: 'enum',
      permissiveValue: '5',
      upstreamDefault: '2',
      docUrl: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux-pro/v1.1',
    });

    expect(OFFICIAL_NSFW_FIELD_POLICIES.moderation).toMatchObject({
      field: 'moderation',
      type: 'enum',
      permissiveValue: 'low',
      upstreamDefault: 'auto',
      docUrl: 'https://api.venice.ai/api/v1/swagger.yaml',
    });

    expect(OFFICIAL_NSFW_FIELD_POLICIES.safety_checker).toMatchObject({
      field: 'safety_checker',
      type: 'enum',
      permissiveValue: 'no',
      upstreamDefault: 'yes',
      docUrl: 'https://modelslab.com/docs/image-generation/text2img',
    });

    expect(OFFICIAL_NSFW_FIELD_POLICIES.nsfw_detection).toMatchObject({
      field: 'nsfw_detection',
      type: 'boolean',
      permissiveValue: false,
      upstreamDefault: true,
      docUrl: 'https://docs.novita.ai/guides/model-apis-v2-to-v3-migration',
    });

    expect(OFFICIAL_NSFW_FIELD_POLICIES.allowMatureContent).toMatchObject({
      field: 'allowMatureContent',
      type: 'boolean',
      permissiveValue: true,
      upstreamDefault: false,
      docUrl: 'https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.json',
    });

    expect(OFFICIAL_NSFW_FIELD_POLICIES.checkNSFW).toMatchObject({
      field: 'checkNSFW',
      type: 'boolean',
      permissiveValue: false,
      upstreamDefault: false,
      docUrl: 'https://docs.runware.ai',
    });

    expect(OFFICIAL_NSFW_FIELD_POLICIES.nsfw).toMatchObject({
      field: 'nsfw',
      type: 'boolean',
      permissiveValue: true,
      upstreamDefault: false,
      docUrl: 'https://civitai.com/api/v1/models',
    });
  });

  it('correctly matches policy by field name', () => {
    expect(isNsfwField('disable_safety_checker')).toBe(true);
    expect(isNsfwField('random_unknown_field')).toBe(false);
    expect(findNsfwPolicy('safe_mode')?.docUrl).toBe('https://api.venice.ai/api/v1/swagger.yaml');
    expect(getNsfwPermissiveDefault('enable_safety_checker')).toBe(false);
    expect(getNsfwPermissiveDefault('disable_safety_checker')).toBe(true);
  });

  describe('extractDeclaredNsfwDefaults', () => {
    it('extracts permissive defaults only for fields declared in schemaProps', () => {
      const togetherProps = {
        prompt: { type: 'string' },
        disable_safety_checker: { type: 'boolean', default: false },
      };
      expect(extractDeclaredNsfwDefaults(togetherProps)).toEqual({
        disable_safety_checker: true,
      });

      const veniceProps = {
        prompt: { type: 'string' },
        safe_mode: { type: 'boolean', default: true },
      };
      expect(extractDeclaredNsfwDefaults(veniceProps)).toEqual({
        safe_mode: false,
      });

      const falProps = {
        prompt: { type: 'string' },
        enable_safety_checker: { type: 'boolean', default: true },
        safety_tolerance: { type: 'string', default: '2' },
      };
      expect(extractDeclaredNsfwDefaults(falProps)).toEqual({
        enable_safety_checker: false,
        safety_tolerance: '5',
      });

      const unrelatedProps = {
        prompt: { type: 'string' },
        seed: { type: 'integer' },
      };
      expect(extractDeclaredNsfwDefaults(unrelatedProps)).toEqual({});
    });
  });

  describe('applyNsfwDefaultsToCustomParameters & Toggle-back path', () => {
    it('transparently adds declared NSFW defaults when missing from custom_parameters', () => {
      const schemaProps = {
        disable_safety_checker: { type: 'boolean' },
      };
      const initial = JSON.stringify({ steps: 20 });
      const next = applyNsfwDefaultsToCustomParameters(initial, schemaProps);
      const parsed = JSON.parse(next);

      expect(parsed.steps).toBe(20);
      expect(parsed.disable_safety_checker).toBe(true);
    });

    it('strictly preserves user toggle-back overrides (e.g. user chose disable_safety_checker: false)', () => {
      const schemaProps = {
        disable_safety_checker: { type: 'boolean' },
      };
      const userToggledBack = JSON.stringify({ disable_safety_checker: false });
      const next = applyNsfwDefaultsToCustomParameters(userToggledBack, schemaProps);
      const parsed = JSON.parse(next);

      // Must remain false as set by user, never overwritten back
      expect(parsed.disable_safety_checker).toBe(false);
    });

    it('strictly preserves user toggle-back overrides for enable_safety_checker (user chose true)', () => {
      const schemaProps = {
        enable_safety_checker: { type: 'boolean' },
      };
      const userToggledBack = JSON.stringify({ enable_safety_checker: true });
      const next = applyNsfwDefaultsToCustomParameters(userToggledBack, schemaProps);
      const parsed = JSON.parse(next);

      expect(parsed.enable_safety_checker).toBe(true);
    });
  });
});
