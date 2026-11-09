import { describe, it, expect } from 'vitest';
import {
  OFFICIAL_NSFW_FIELD_POLICIES,
  UNVERIFIED_NSFW_FIELDS,
  findNsfwPolicy,
  isNsfwField,
  getNsfwPermissiveDefault,
  extractDeclaredNsfwDefaults,
  applyNsfwDefaultsToCustomParameters,
} from './nsfw';

describe('Official NSFW & Safety field facts', () => {
  it('verified official NSFW switches cite their verified official sources', () => {
    expect(OFFICIAL_NSFW_FIELD_POLICIES.enable_safety_checker).toMatchObject({
      field: 'enable_safety_checker',
      type: 'boolean',
      permissiveValue: false,
      upstreamDefault: true,
      docUrl: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux-lora',
    });

    expect(OFFICIAL_NSFW_FIELD_POLICIES.enable_output_safety_checker).toMatchObject({
      field: 'enable_output_safety_checker',
      type: 'boolean',
      permissiveValue: false,
      upstreamDefault: false,
      restrictedValue: true,
      permissiveLabel: 'false',
      restrictedLabel: 'true',
      docUrl: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/wan/v2.2-a14b/image-to-video/lora',
    });

    expect(OFFICIAL_NSFW_FIELD_POLICIES.disable_safety_checker).toMatchObject({
      field: 'disable_safety_checker',
      type: 'boolean',
      permissiveValue: true,
      upstreamDefault: false,
      docUrl: 'https://docs.together.ai/docs/inference/images/parameters',
    });

    expect(OFFICIAL_NSFW_FIELD_POLICIES.safe_mode).toMatchObject({
      field: 'safe_mode',
      type: 'boolean',
      permissiveValue: false,
      upstreamDefault: true,
      docUrl: 'https://docs.venice.ai/guides/media/image-generation',
    });

    expect(OFFICIAL_NSFW_FIELD_POLICIES.safety_tolerance).toMatchObject({
      field: 'safety_tolerance',
      type: 'enum',
      permissiveValue: '5',
      upstreamDefault: '2',
      docUrl: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux-2-flex',
    });

    expect(OFFICIAL_NSFW_FIELD_POLICIES.moderation).toMatchObject({
      field: 'moderation',
      type: 'enum',
      permissiveValue: 'low',
      upstreamDefault: 'auto',
      docUrl: 'https://docs.venice.ai/guides/media/image-generation',
    });

    expect(OFFICIAL_NSFW_FIELD_POLICIES.allowMatureContent).toMatchObject({
      field: 'allowMatureContent',
      type: 'boolean',
      permissiveValue: true,
      upstreamDefault: undefined,
      docUrl: 'https://developer.civitai.com/orchestration/guide/submitting-work',
    });

    expect(OFFICIAL_NSFW_FIELD_POLICIES.nsfw).toMatchObject({
      field: 'nsfw',
      type: 'boolean',
      permissiveValue: true,
      upstreamDefault: false,
      docUrl: 'https://developer.civitai.com/site/reference/models',
    });
  });

  it('unverified or conflicting switches are documented and excluded from the field list', () => {
    expect(UNVERIFIED_NSFW_FIELDS.checkNSFW.status).toBe('unverified');
    expect(UNVERIFIED_NSFW_FIELDS.nsfw_detection.status).toBe('unverified_schema_mismatch');
    expect(UNVERIFIED_NSFW_FIELDS.safety_checker.status).toBe('conflicting_documentation');
    expect(UNVERIFIED_NSFW_FIELDS.safetySettings.status).toBe('unverified_in_schema');

    expect(isNsfwField('checkNSFW')).toBe(false);
    expect(isNsfwField('nsfw_detection')).toBe(false);
    expect(isNsfwField('safety_checker')).toBe(false);
    expect(isNsfwField('safetySettings')).toBe(false);
  });

  it('correctly matches policy by field name', () => {
    expect(isNsfwField('disable_safety_checker')).toBe(true);
    expect(isNsfwField('random_unknown_field')).toBe(false);
    expect(findNsfwPolicy('safe_mode')?.docUrl).toBe('https://docs.venice.ai/guides/media/image-generation');
    expect(getNsfwPermissiveDefault('enable_safety_checker')).toBe(false);
    expect(getNsfwPermissiveDefault('disable_safety_checker')).toBe(true);
  });

  describe('extractDeclaredNsfwDefaults', () => {
    it('lists only fields the schema declares, and lists nothing for an unrelated schema', () => {
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

      const falVideoProps = {
        prompt: { type: 'string' },
        enable_safety_checker: { type: 'boolean', default: false },
        enable_output_safety_checker: { type: 'boolean', default: false },
      };
      expect(extractDeclaredNsfwDefaults(falVideoProps)).toEqual({
        enable_safety_checker: false,
        enable_output_safety_checker: false,
      });

      const unrelatedProps = {
        prompt: { type: 'string' },
        seed: { type: 'integer' },
      };
      expect(extractDeclaredNsfwDefaults(unrelatedProps)).toEqual({});
      expect(extractDeclaredNsfwDefaults(undefined)).toEqual({});
    });
  });

  describe('applyNsfwDefaultsToCustomParameters', () => {
    it('writes declared safety switches with their permissive defaults while keeping user keys', () => {
      const schemaProps = { disable_safety_checker: { type: 'boolean' } };
      const initial = JSON.stringify({ steps: 20 });
      expect(JSON.parse(applyNsfwDefaultsToCustomParameters(initial, schemaProps))).toEqual({
        steps: 20,
        disable_safety_checker: true,
      });
    });

    it('returns the user value unchanged, including a restrictive choice', () => {
      const schemaProps = { disable_safety_checker: { type: 'boolean' } };
      const userSet = JSON.stringify({ disable_safety_checker: false, steps: 20 });
      expect(applyNsfwDefaultsToCustomParameters(userSet, schemaProps)).toBe(userSet);
    });

    it('returns the user value unchanged when they chose the open value', () => {
      const schemaProps = {
        enable_safety_checker: { type: 'boolean' },
        enable_output_safety_checker: { type: 'boolean' },
      };
      const userSet = JSON.stringify({ enable_safety_checker: false, enable_output_safety_checker: false });
      expect(applyNsfwDefaultsToCustomParameters(userSet, schemaProps)).toBe(userSet);
    });

    it('seeds enable_output_safety_checker=false when declared in schema, and never injects it when not declared', () => {
      expect(
        JSON.parse(
          applyNsfwDefaultsToCustomParameters(
            JSON.stringify({ steps: 27 }),
            { prompt: { type: 'string' }, enable_output_safety_checker: { type: 'boolean', default: false } }
          )
        )
      ).toEqual({
        steps: 27,
        enable_output_safety_checker: false,
      });
      expect(
        JSON.parse(
          applyNsfwDefaultsToCustomParameters(
            JSON.stringify({ steps: 27 }),
            { prompt: { type: 'string' } }
          )
        )
      ).toEqual({
        steps: 27,
      });
    });

    it('seeds permissive defaults into an empty custom_parameters when schema declares a switch', () => {
      expect(JSON.parse(applyNsfwDefaultsToCustomParameters(undefined, { safe_mode: { type: 'boolean' } }))).toEqual({
        safe_mode: false,
      });
      expect(applyNsfwDefaultsToCustomParameters(undefined, { prompt: { type: 'string' } })).toBe('{}');
    });
  });
});
