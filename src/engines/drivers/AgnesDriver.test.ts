import {it,expect,vi,afterEach} from 'vitest';
import {AgnesDriver} from './AgnesDriver';
const original=globalThis.fetch;
afterEach(()=>globalThis.fetch=original);
it('Agnes video goes to the video route with duration / resolution; never images/generations',async()=>{
  const request=vi.fn().mockResolvedValue({ok:false,status:401,json:async()=>({error:'unauthorized'})});globalThis.fetch=request;
  await expect(new AgnesDriver().generate({model:'agnes-video-2.5',prompt:'robot',videoDuration:8,aspectRatio:'16:9',extraParams:{size:'1080P'}},{})).rejects.toThrow('unauthorized');
  expect(request.mock.calls[0][0]).toBe('/api/video/generate');
  expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({provider:'agnes',model:'agnes-video-2.5',duration:8,size:'1080P',aspect_ratio:'16:9'});
});
