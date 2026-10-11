import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSenseNovaImageRequest } from './senseNovaImageContract';

describe('SenseNova U1.5 Lite official image contract', () => {
  const base = { model:'sensenova-u1.5-lite', prompt:'paper lantern workshop' };
  it('uses the verified text-to-image endpoint and does not rewrite prompt', () => {
    expect(buildSenseNovaImageRequest({...base,width:1024,height:768})).toMatchObject({
      endpoint:'/images/generations',
      payload:{model:'sensenova-u1.5-lite',prompt:'paper lantern workshop',size:'1024x768',n:1,output_format:'png',response_format:'b64_json'},
      overrides:[],
    });
    expect(buildSenseNovaImageRequest({...base,watermark:true}).payload.watermark).toBe(true);
    expect(buildSenseNovaImageRequest({...base,watermark:false}).payload.watermark).toBe(false);
    expect(buildSenseNovaImageRequest(base).payload).not.toHaveProperty('watermark');
    expect(buildSenseNovaImageRequest({...base,prompt_extend:true}).payload.prompt_extend).toBe(true);
    expect(buildSenseNovaImageRequest({...base,prompt_extend:false}).payload.prompt_extend).toBe(false);
  });
  it('SenseNova generate route accepts large reference image bodies', () => {
  const source = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('const LARGE_BODY_ROUTES'), source.indexOf('const isLargeBodyRoute'));
  expect(block).toContain("'/api/engine/sensenova/generate'");
});
it('uses the official edits images array and leaves source URL intact', () => {
    const r=buildSenseNovaImageRequest({...base,image_url:'https://example.org/source.png',size:'2K'});
    expect(r.endpoint).toBe('/images/edits');
    expect(r.payload.images).toEqual([{image_url:'https://example.org/source.png'}]);
    expect(r.payload.size).toBe('2K');
  });
  it('keeps unknown custom JSON while protecting model and endpoint fields', () => {
    const result = buildSenseNovaImageRequest({ ...base, custom_parameters: { future_knob: 123, model: 'OVERRIDDEN' } });
    expect(result.payload.future_knob).toBe(123);
    expect(result.payload.model).toBe('sensenova-u1.5-lite');
    expect(result.overrides).toEqual([{ field: 'model', requested: 'sensenova-u1.5-lite', custom: 'OVERRIDDEN', applied: false }]);
  });
  it('does not quietly drop unsupported diffusion params or LoRA', () => {
    expect(()=>buildSenseNovaImageRequest({...base,steps:20,loras:[{name:'x'}]})).toThrow(/steps, loras/);
  });
  it('rejects invalid sizes and unsupported batch counts', () => {
    expect(()=>buildSenseNovaImageRequest({...base,width:1025,height:768})).toThrow(/32 的倍数/);
    expect(()=>buildSenseNovaImageRequest({...base,n:2})).toThrow(/n=1/);
  });
  it('rejects loopback image sources and accepts data-image URLs', () => {
    expect(()=>buildSenseNovaImageRequest({...base,image_url:'http://127.0.0.1/image.png'})).toThrow(/本机/);
    expect(buildSenseNovaImageRequest({...base,image_url:'data:image/png;base64,AAAA'}).endpoint).toBe('/images/edits');
  });
});
