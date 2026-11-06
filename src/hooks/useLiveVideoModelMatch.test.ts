import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../services/api', () => ({ fetchLiveModelsShared: vi.fn(), getStoredApiKeys: () => ({ sogniKey: 'sogni-mock-key' }) }));
import { findLiveVideoModel, liveVideoOption, useLiveVideoSchema, getLiveVideoSchema, _resetLiveVideoSchemaCache } from './useLiveVideoModelMatch';
import { nodeHasReferenceImage } from '../components/NodeItem';

describe('live video catalog match (preset model → dropdown entry)', () => {
  it('selects the live catalog entry when the provider list contains the preset id', () => {
    const data = { wavespeed: [{ id: 'wavespeed-ai/wan-2.1/i2v-480p-lora-ultra-fast' }, { id: 'wavespeed-ai/wan-2.1/i2v-480p-lora', name: 'wavespeed-ai/wan-2.1/i2v-480p-lora' }] };
    expect(findLiveVideoModel(data, 'wavespeed', 'wavespeed-ai/wan-2.1/i2v-480p-lora')).toEqual({ value: 'wavespeed-ai/wan-2.1/i2v-480p-lora', label: 'wavespeed-ai/wan-2.1/i2v-480p-lora' });
  });
  it('never injects a model the live list lacks', () => {
    expect(findLiveVideoModel({ replicate: [{ id: 'wan-video/wan-2.5-i2v' }] }, 'replicate', 'wan-video/wan2.1-with-lora')).toBeUndefined();
    expect(findLiveVideoModel({}, 'muapi', 'wan2.1-lora-i2v')).toBeUndefined();
  });
  it('Replicate row label carries the latest_version that will be used', () => {
    expect(liveVideoOption({ id: 'wan-video/wan2.1-with-lora', latest_version: { id: 'c48fa8ec65b13e4c1e8e2c2f0d3b7a1e' } })!.label).toBe('wan-video/wan2.1-with-lora:c48fa8ec…');
  });
});

describe('useLiveVideoSchema hasReference wiring', () => {
  const originalFetch = globalThis.fetch;
  let useStateSpy: any;

  beforeEach(() => {
    _resetLiveVideoSchemaCache();
    useStateSpy = vi.spyOn(React, 'useState').mockReturnValue([0, vi.fn()] as any);
  });

  afterEach(() => {
    useStateSpy.mockRestore();
    globalThis.fetch = originalFetch;
    _resetLiveVideoSchemaCache();
  });

  it('sends hasReference=true on schema GET when hasReference is true', async () => {
    const requestedUrls: string[] = [];
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      requestedUrls.push(url);
      return {
        ok: true,
        json: async () => ({
          schemaStatus: 'hosted-tool:animate_photo',
          hostedToolName: 'animate_photo',
          selectorField: 'animationModel',
          inputSchema: { properties: { animationModel: {} } },
        }),
      } as any;
    });

    useLiveVideoSchema('sogni', 'ltx25', true);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(requestedUrls).toHaveLength(1);
    expect(requestedUrls[0]).toContain('/api/model-schema?provider=sogni&model=ltx25&isVideo=true&hasReference=true');

    const schema = getLiveVideoSchema('sogni', 'ltx25', true);
    expect(schema).toBeDefined();
    expect(schema?.schemaStatus).toBe('hosted-tool:animate_photo');
    expect(schema?.hostedToolName).toBe('animate_photo');
  });

  it('omits hasReference when hasReference is false or omitted', async () => {
    const requestedUrls: string[] = [];
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      requestedUrls.push(url);
      return {
        ok: true,
        json: async () => ({
          schemaStatus: 'hosted-tool:generate_video',
          hostedToolName: 'generate_video',
          selectorField: 'videoModel',
          inputSchema: { properties: { videoModel: {} } },
        }),
      } as any;
    });

    useLiveVideoSchema('sogni', 'ltx25', false);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(requestedUrls).toHaveLength(1);
    expect(requestedUrls[0]).toBe('/api/model-schema?provider=sogni&model=ltx25&isVideo=true');

    const schema = getLiveVideoSchema('sogni', 'ltx25', false);
    expect(schema).toBeDefined();
    expect(schema?.schemaStatus).toBe('hosted-tool:generate_video');
    expect(schema?.hostedToolName).toBe('generate_video');
  });

  it('nodeHasReferenceImage detects reference image from props, schemaCustomParameters, custom_parameters, and node.values', () => {
    const baseNode: any = { id: 'v1', type: 'AIVideoNode', values: {} };

    expect(nodeHasReferenceImage(baseNode, undefined, true)).toBe(true);
    expect(nodeHasReferenceImage(baseNode, undefined, false)).toBe(false);

    // schemaCustomParameters with _canvas.hasReferenceImage
    const scpWithRef = JSON.stringify({ _canvas: { hasReferenceImage: true } });
    expect(nodeHasReferenceImage(baseNode, scpWithRef)).toBe(true);

    const scpWithoutRef = JSON.stringify({ _canvas: { hasReferenceImage: false } });
    expect(nodeHasReferenceImage(baseNode, scpWithoutRef)).toBe(false);

    // node values custom_parameters
    const nodeWithCp: any = { id: 'v2', type: 'AIVideoNode', values: { custom_parameters: JSON.stringify({ _canvas: { hasReferenceImage: true } }) } };
    expect(nodeHasReferenceImage(nodeWithCp)).toBe(true);

    // node values image_url
    const nodeWithImg: any = { id: 'v3', type: 'AIVideoNode', values: { image_url: 'https://example.com/test.png' } };
    expect(nodeHasReferenceImage(nodeWithImg)).toBe(true);
  });
});
