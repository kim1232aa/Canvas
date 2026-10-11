import { afterEach, describe, expect, it, vi } from 'vitest';
import { CivitaiDriver } from './CivitaiDriver';

describe('CivitaiDriver history provenance', () => {
  it('sends explicit engine/ecosystem/model and quantity for image recipes without dropping zero', async () => {
    const requests: any[] = [];
    globalThis.fetch = vi.fn(async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({imageUrl:'https://example.test/output.png'}));
    });
    await new CivitaiDriver().generate({prompt:'test',model:'urn:air:sdxl:checkpoint:civitai:123@456',steps:0,cfg:0,seed:0,extraParams:{engine:'comfy',ecosystem:'sdxl',comfyModel:'custom',quantity:0}}, {});
    expect(requests[0]).toMatchObject({engine:'comfy',ecosystem:'sdxl',comfyModel:'custom',quantity:0,steps:0,cfg:0,seed:0});
  });
  it('forwards advanced JSON as a separate object without changing routing or LoRA intent', async () => {
    const bodies: any[]=[];
    globalThis.fetch=vi.fn(async (_url,init)=>{bodies.push(JSON.parse(String(init?.body)));return new Response(JSON.stringify({imageUrl:'https://example.test/out.png'}));});
    const custom={unknown_flag:true,enable_safety_checker:false,cfgScale:0,model:'explicit-override',loras:{'urn:air:sdxl:lora:civitai:789@123':0}};
    await new CivitaiDriver().generate({prompt:'test',model:'urn:air:sdxl:checkpoint:civitai:123@456',loras:[{name:'urn:air:sdxl:lora:civitai:789@123',strength:0}],extraParams:{engine:'comfy',custom_parameters:custom}},{});
    expect(bodies[0].custom_parameters).toEqual(custom);
    expect(bodies[0].model).toBe('urn:air:sdxl:checkpoint:civitai:123@456');
    expect(bodies[0].loras).toEqual([expect.objectContaining({name:'urn:air:sdxl:lora:civitai:789@123',strength:0})]);
  });
  it('carries spatial advanced JSON to the site body and rejects non-object JSON before HTTP', async()=>{
    const {spatialRequestParameters}=await import('../../utils/frontendParameters');
    const bodies:any[]=[];
    globalThis.fetch=vi.fn(async (_url,init)=>{bodies.push(JSON.parse(String(init?.body)));return new Response(JSON.stringify({imageUrl:'https://example.test/out.png'}));});
    const frame={id:'f',title:'test',pos:{x:0,y:0},width:400,height:400,prompt:'test',negativePrompt:'',createdAt:0,status:'idle' as const,params:{checkpoint:'urn:air:sdxl:checkpoint:civitai:123@456',targetProvider:'civitai' as const,seedControl:'fixed' as const,width:1024,height:1024,batchSize:1,denoise:0,loras:[],customParameters:'{"unknown_flag":true,"safety":false,"cfgScale":0}'}};
    await new CivitaiDriver().generate(spatialRequestParameters(frame),{});
    expect(bodies[0].custom_parameters).toEqual({unknown_flag:true,safety:false,cfgScale:0});
    expect(()=>spatialRequestParameters({...frame,params:{...frame.params,customParameters:'[]'}})).toThrow(/JSON 对象/);
    expect(bodies).toHaveLength(1);
  });
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    vi.restoreAllMocks();
  });

  it('persists effective upstream parameters after an async Civitai workflow completes', async () => {
    const historyBodies: any[] = [];
    globalThis.setTimeout = ((callback: (...args: any[]) => void) => {
      callback();
      return 0 as any;
    }) as typeof setTimeout;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/engine/civitai/generate') {
        return new Response(JSON.stringify({
          pending: true,
          workflowId: 'wf-1',
          pendingHistory: {
            prompt: 'reference portrait',
            provider: 'Civitai 官方原生生成引擎',
            model: 'urn:air:sd1:checkpoint:civitai:4384@128713',
            seed: null,
            steps: null,
            cfg: null,
            sampler: null,
            scheduler: null,
            width: null,
            height: null,
            loras: [{ name: 'urn:air:sd1:lora:civitai:82098@87153', strength: 0.7 }],
          },
          requestMetadata: {
            route: '/api/engine/civitai/generate',
            requestedParameters: { prompt: 'reference portrait' },
            actualParameters: { engine: 'sdcpp', prompt: 'reference portrait' },
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url === '/api/civitai/workflow/wf-1') {
        return new Response(JSON.stringify({
          status: 'succeeded',
          mediaUrl: 'data:image/jpeg;base64,ZmFrZQ==',
          raw: {
            status: 'succeeded',
            steps: [{
              input: {
                width: 512,
                height: 512,
                steps: 20,
                cfgScale: 7,
                sampleMethod: 'euler',
                schedule: 'discrete',
                model: 'urn:air:sd1:checkpoint:civitai:4384@128713',
              },
            }],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url === '/api/history') {
        const body = JSON.parse(String(init?.body || '{}'));
        historyBodies.push(body);
        return new Response(JSON.stringify({ id: 'hist-1', ...body }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const driver = new CivitaiDriver();
    const result = await (driver as any).executeGenerate({
      model: 'urn:air:sd1:checkpoint:civitai:4384@128713',
      prompt: 'reference portrait',
      loras: [{ name: 'urn:air:sd1:lora:civitai:82098@87153', strength: 0.7 }],
      workflowSnapshot: { nodes: [], connections: [] },
    }, { civitaiKey: 'fixture-key' });

    expect(result.mediaUrl).toBe('data:image/jpeg;base64,ZmFrZQ==');
    expect(historyBodies).toHaveLength(1);
    expect(historyBodies[0]).toMatchObject({
      steps: 20,
      cfg: 7,
      sampler: 'euler',
      scheduler: 'discrete',
      width: 512,
      height: 512,
      requestMetadata: {
        requestedParameters: { prompt: 'reference portrait' },
        actualParameters: { engine: 'sdcpp', prompt: 'reference portrait' },
        effectiveParameters: {
          width: 512,
          height: 512,
          steps: 20,
          cfgScale: 7,
          sampleMethod: 'euler',
          schedule: 'discrete',
        },
      },
    });
  });
});
