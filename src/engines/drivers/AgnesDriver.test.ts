import {it,expect,vi,afterEach} from 'vitest';
import {AgnesDriver} from './AgnesDriver';
const original=globalThis.fetch;
afterEach(()=>globalThis.fetch=original);
it('Agnes video goes to the video route with duration / resolution; never images/generations',async()=>{
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'unauthorized'}), { status: 401 }));globalThis.fetch=request;
  await expect(new AgnesDriver().generate({model:'agnes-video-2.5',prompt:'robot',videoDuration:8,aspectRatio:'16:9',extraParams:{size:'1080P'}},{})).rejects.toThrow('unauthorized');
  expect(request.mock.calls[0][0]).toBe('/api/video/generate');
  expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({provider:'agnes',model:'agnes-video-2.5',duration:8,size:'1080P',aspect_ratio:'16:9'});
});

it('Agnes image sends only verified image fields and records stale canvas omissions',async()=>{
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'missing key'}), { status: 400 }));globalThis.fetch=request;
  await expect(new AgnesDriver().generate({
    model:'agnes-image-2.1-flash',prompt:'terrarium library',negative_prompt:'blurry',width:1024,height:1024,seed:314159,steps:24,cfg:3.2,sampler_name:'euler',scheduler:'karras',denoise:1,loras:[],extraParams:{resolution:'1k'}
  },{})).rejects.toThrow('missing key');
  expect(request.mock.calls[0][0]).toBe('/api/engine/agnes/generate');
  const body=JSON.parse(request.mock.calls[0][1].body);
  expect(body).toMatchObject({model:'agnes-image-2.1-flash',prompt:'terrarium library',width:1024,height:1024});
  for(const field of ['negative_prompt','seed','steps','cfg','sampler_name','scheduler','denoise']) expect(body).not.toHaveProperty(field);
  expect(body.parameterOmissions.map((x:any)=>x.field)).toEqual(expect.arrayContaining(['negative_prompt','seed','steps','cfg','sampler_name','scheduler','denoise','resolution']));
});