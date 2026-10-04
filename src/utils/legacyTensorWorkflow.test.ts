import {describe,it,expect} from 'vitest';
import {migrateTensorWorkflow} from './legacyTensorWorkflow';
import {WORKFLOW_PRESETS} from '../constants/presets';
import {isInvalidTensorModel} from './modelCatalog';
describe('retired Tensor tools',()=>{
 it('preserves the original selection and workflow while clearing only tool fields',()=>{
  const old:any={nodes:[{id:'model',title:'Old tool',values:{targetProvider:'tensorart',ckpt_name:'photoreal_studio_z_image',prompt:'keep',loras:[{name:'123',weight:0.7}]}},{id:'valid',values:{targetProvider:'tensorart',ckpt_name:'613045163490732233'}}],connections:[{from:'model',to:'sampler'}],spatialFrames:[]};
  const result=migrateTensorWorkflow(old);
  expect(result.nodes[0].values.ckpt_name).toBe('');
  expect(result.nodes[0].values.retiredToolSelection).toEqual({ckpt_name:'photoreal_studio_z_image'});
  expect(result.nodes[0].values.loras).toEqual(old.nodes[0].values.loras);
  expect(result.connections).toEqual(old.connections);
  expect(result.nodes[1]).toEqual(old.nodes[1]);
  expect(old.nodes[0].values.ckpt_name).toBe('photoreal_studio_z_image');
  expect(migrateTensorWorkflow(result)).toEqual(result);
 });
 it('does not rewrite another provider using the same text',()=>{
  const old:any={nodes:[{values:{targetProvider:'custom',ckpt_name:'photoreal_studio_z_image'}}]};
  expect(migrateTensorWorkflow(old)).toEqual(old);
 });
 it('migrates spatial selectors without removing LoRA settings',()=>{
  const old:any={nodes:[],spatialFrames:[{params:{targetProvider:'tensorart',checkpoint:'strong_text2image_nano_banana2',loras:[{name:'keep',strength:0.8}]}}]};
  const result=migrateTensorWorkflow(old);
  expect(result.spatialFrames[0].params.checkpoint).toBe('');
  expect(result.spatialFrames[0].params.loras).toEqual(old.spatialFrames[0].params.loras);
 });
 it('ships no runnable preset that uses a Tensor tool as a model',()=>{
  expect(WORKFLOW_PRESETS.flatMap(p=>p.nodes).filter(n=>isInvalidTensorModel(n.values.targetProvider,n.values.ckpt_name))).toEqual([]);
 });
});
