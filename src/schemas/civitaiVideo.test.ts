import {expect,it} from 'vitest';
import {buildCivitaiVideoInput} from './civitaiVideo';
it('preserves selected Wan recipe, sourceImage and LoRA instead of dropping parameters',()=>{
 const body={engine:'wan',version:'v2.1',provider:'civitai',model:'urn:air:wan:checkpoint:civitai:1@2',prompt:'river',cfg:4,steps:20,seed:0,image_url:'https://example.test/input.png',loras:[{name:'urn:air:wan:lora:civitai:3@4',strength:0}]};
 const input = buildCivitaiVideoInput({...body, fps: 24});
 expect(input).toMatchObject({diffusionModel:body.model,sourceImage:body.image_url,seed:0,steps:20,cfgScale:4,fps:24,loras:[{air:body.loras[0].name,strength:0}]});
 expect(input).not.toHaveProperty('model');
 expect(input).not.toHaveProperty('frameRate');
 expect(()=>buildCivitaiVideoInput({...body,negative_prompt:'blur'})).toThrow(/未声明/);
 expect(()=>buildCivitaiVideoInput({...body,version:'v2.7'})).toThrow(/尚未核实/);
});

it('preserves canonical Wan overrides and caller JSON fields verbatim', () => {
 const selected = 'urn:air:wan:checkpoint:civitai:1@2';
 const overridden = 'urn:air:wan:checkpoint:civitai:8@9';
 const customOnly = 'caller-owned-model-field';
 const input = buildCivitaiVideoInput({
  engine:'wan',version:'v2.1',provider:'civitai',model:selected,prompt:'river',cfg:4,
  custom_parameters:{diffusionModel:overridden,fps:30,model:customOnly,customWireField:'keep'},
 });
 expect(input).toMatchObject({diffusionModel:overridden,fps:30,model:customOnly,customWireField:'keep'});
});
