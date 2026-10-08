import { describe, expect, it } from 'vitest';
import { buildSenseNovaImageRequest } from './senseNovaImageContract';

describe('SenseNova U1.5 Lite official image contract', () => {
  const base = { model:'sensenova-u1.5-lite', prompt:'paper lantern workshop' };
  it('uses the verified text-to-image endpoint and does not rewrite prompt', () => {
    expect(buildSenseNovaImageRequest({...base,width:1024,height:768})).toEqual({
      endpoint:'/images/generations',
      payload:{model:'sensenova-u1.5-lite',prompt:'paper lantern workshop',size:'1024x768',n:1,output_format:'png',response_format:'b64_json',watermark:true,prompt_extend:false},
    });
  });
  it('uses the official edits images array and leaves source URL intact', () => {
    const r=buildSenseNovaImageRequest({...base,image_url:'https://example.org/source.png',size:'2K'});
    expect(r.endpoint).toBe('/images/edits');
    expect(r.payload.images).toEqual([{image_url:'https://example.org/source.png'}]);
    expect(r.payload.size).toBe('2K');
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