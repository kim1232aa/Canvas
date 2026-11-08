import {describe,expect,it,vi,beforeEach} from 'vitest';
import {SenseNovaDriver} from './SenseNovaDriver';
import {tracedFetch} from '../../services/executionTrace';
vi.mock('../../services/executionTrace',()=>({tracedFetch:vi.fn()}));
const mock=vi.mocked(tracedFetch);
describe('SenseNova images',()=>{
 beforeEach(()=>mock.mockReset());
 it('routes and sends every filled input parameter as filled',async()=>{
  mock.mockResolvedValue(new Response(JSON.stringify({imageUrl:'data:image/png;base64,AAAA',model:'sensenova-u1.5-lite'}),{status:200}));
  const output=await new SenseNovaDriver().generate({model:'sensenova-u1.5-lite',prompt:'unique prompt',steps:20,negative_prompt:'blur',loras:[{name:'x'}]},{});
  expect(output.providerId).toBe('sensenova');
  expect(mock.mock.calls[0][0]).toBe('/api/engine/sensenova/generate');
  const body=JSON.parse(String(mock.mock.calls[0][1]?.body));
  expect(body).toMatchObject({steps:20,negative_prompt:'blur',loras:[{name:'x'}]});
  expect(body).not.toHaveProperty('parameterOmissions');
 });
 it('does not hide upstream billing errors',async()=>{
  mock.mockResolvedValue(new Response(JSON.stringify({error:'No remaining credits'}),{status:402}));
  await expect(new SenseNovaDriver().generate({model:'sensenova-u1.5-lite',prompt:'sample'},{})).rejects.toThrow(/HTTP 402.*remaining credits/);
 });
});

describe('SenseNova batchSize',()=>{
 beforeEach(()=>mock.mockReset());
 it('forwards params.batchSize as n and omits it when unset or 0',async()=>{
  mock.mockImplementation(async()=>new Response(JSON.stringify({imageUrl:'data:image/png;base64,AAAA',model:'sensenova-u1.5-lite'}),{status:200}));
  const d=new SenseNovaDriver();
  await d.generate({model:'sensenova-u1.5-lite',prompt:'a lighthouse at dusk',batchSize:1},{});
  await d.generate({model:'sensenova-u1.5-lite',prompt:'a lighthouse at dusk'},{});
  await d.generate({model:'sensenova-u1.5-lite',prompt:'a lighthouse at dusk',batchSize:0},{});
  const bodies=mock.mock.calls.map(c=>JSON.parse(String(c[1]?.body)));
  expect(bodies[0].n).toBe(1);
  expect(bodies[1]).not.toHaveProperty('n');
  expect(bodies[2]).not.toHaveProperty('n');
 });
});
