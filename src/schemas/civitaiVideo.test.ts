import {expect,it} from 'vitest';
import {buildCivitaiVideoInput} from './civitaiVideo';
it('preserves selected Wan recipe, sourceImage and LoRA instead of dropping parameters',()=>{
 const body={engine:'wan',version:'v2.1',provider:'civitai',model:'urn:air:wan:checkpoint:civitai:1@2',prompt:'river',cfg:4,steps:20,seed:0,image_url:'https://example.test/input.png',loras:[{name:'urn:air:wan:lora:civitai:3@4',strength:0}]};
 expect(buildCivitaiVideoInput(body)).toMatchObject({sourceImage:body.image_url,seed:0,steps:20,cfgScale:4,loras:[{air:body.loras[0].name,strength:0}]});
 expect(()=>buildCivitaiVideoInput({...body,negative_prompt:'blur'})).toThrow(/未声明/);
 expect(()=>buildCivitaiVideoInput({...body,version:'v2.7'})).toThrow(/尚未核实/);
});
