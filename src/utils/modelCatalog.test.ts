import {it,expect} from 'vitest';
import {readCheckpointCatalog,mergeCheckpointOptions,isInvalidTensorModel} from './modelCatalog';
import {TENSOR_CATALOG_TAGS,tensorCatalogUrl} from '../schemas/tensorCatalog';
it('uses verified public category links and rejects invented catalog routes',()=>{
 expect(TENSOR_CATALOG_TAGS.length).toBe(26);
 expect(tensorCatalogUrl('all')).toBe('https://tusi.cn/models');
 expect(tensorCatalogUrl('flux')).toBe('https://tusi.cn/models?tag=flux');
 expect(()=>tensorCatalogUrl('unpublished')).toThrow(/未知/);
 expect(isInvalidTensorModel('tensorart','https://tensor.art/models/672797109289765558')).toBe(false);
});
it('uses every live Tensor checkpoint instead of limiting the dropdown to three shortcuts',()=>{
 const rows=Array.from({length:30},(_,i)=>({id:String(672797109289765558n+BigInt(i)),name:`Model ${i}`,type:'CHECKPOINT'}));
 rows.push({id:'672390779613802167',name:'adapter',type:'LORA'});
 const result=readCheckpointCatalog({tensorart:rows,_pagination:{tensorart:{page:1,hasMore:true,nextCursor:'next'}}},'tensorart');
 const options=mergeCheckpointOptions('tensorart',result.options);
 expect(result.options).toHaveLength(30);expect(options.length).toBeGreaterThan(3);
 expect(options.some(row=>row.value===rows[29].id)).toBe(true);expect(options.some(row=>row.value==='672390779613802167')).toBe(false);
 expect(result).toMatchObject({hasMore:true,nextCursor:'next'});
 expect(isInvalidTensorModel('tensorart','photoreal_studio_z_image')).toBe(true);
});
it('keeps only the chosen provider and surfaces catalog failures',()=>{
 expect(()=>readCheckpointCatalog({tensorart:{error:'upstream unavailable'}},'tensorart')).toThrow(/upstream unavailable/);
 expect(()=>readCheckpointCatalog({huggingface:[]},'tensorart')).toThrow(/所选供应商/);
 expect(mergeCheckpointOptions('tensorart',[{provider:'huggingface',value:'foreign/repo',label:'foreign'}]).some(row=>row.value==='foreign/repo')).toBe(false);
});
