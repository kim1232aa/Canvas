import {it,expect} from 'vitest';
import {readCheckpointCatalog,mergeCheckpointOptions,isInvalidTensorModel,getDriverModelSuggestions} from './modelCatalog';
import {TENSOR_CATALOG_TAGS,tensorCatalogUrl} from '../schemas/tensorCatalog';

it('uses verified public category links and rejects invented catalog routes',()=>{
 expect(TENSOR_CATALOG_TAGS.length).toBe(26);
 expect(tensorCatalogUrl('all')).toBe('https://tensor.art/models/');
 expect(tensorCatalogUrl('flux')).toBe('https://tensor.art/models/?tag=flux');
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

it('extracts sourceNotice, sourceUrl, catalogNotice and flags isLookupOnly only when truly no catalog', () => {
  // Mage: truly no public remote catalog
  const mageRes = readCheckpointCatalog({
    mage: [],
    _pagination: {
      mage: {
        page: 1,
        sourceUrl: 'https://docs.mage.space/api/models/mango',
        sourceNotice: 'lookup-only (no public remote catalog; model_id enum on Mango docs)',
        catalogAvailable: false,
        noPublicRemoteCatalog: true,
      },
    },
    catalogNotices: {
      mage: 'Mage 无公开远端模型检索目录；请按官方 model_id 选用。',
    },
  }, 'mage');
  expect(mageRes.options).toHaveLength(0);
  expect(mageRes.isLookupOnly).toBe(true);
  expect(mageRes.sourceUrl).toBe('https://docs.mage.space/api/models/mango');
  expect(mageRes.catalogNotice).toBe('Mage 无公开远端模型检索目录；请按官方 model_id 选用。');

  // Runware without key: catalog exists, requires key -> isLookupOnly MUST be false
  const rwNoKeyRes = readCheckpointCatalog({
    runware: [],
    _pagination: {
      runware: {
        page: 1,
        sourceUrl: 'https://docs.runware.ai',
        sourceNotice: 'lookup-only (no api key configured)',
        catalogAvailable: true,
        requiresApiKey: true,
      },
    },
    catalogNotices: {
      runware: 'Runware 实时模型搜索需要配置 API Key',
    },
  }, 'runware');
  expect(rwNoKeyRes.options).toHaveLength(0);
  expect(rwNoKeyRes.isLookupOnly).toBe(false);
  expect(rwNoKeyRes.catalogNotice).toBe('Runware 实时模型搜索需要配置 API Key');
});

it('extracts driver model suggestions generically without hardcoding provider checks', () => {
  const mageSuggestions = getDriverModelSuggestions('mage');
  expect(mageSuggestions.length).toBeGreaterThan(0);
  expect(mageSuggestions.some((s) => s.id === 'mango-v3')).toBe(true);
  expect(mageSuggestions.every((s) => s.declaredInDriver === true)).toBe(true);

  const mockRegistry = {
    getDriver: (id: string) => {
      if (id === 'custom-test-provider') {
        return {
          supportedModels: [
            { id: 'custom-model-alpha', name: 'Alpha Model', description: 'Test model' },
            { id: 'custom-video-model', name: 'Video Only', type: 'video' },
          ],
        };
      }
      return undefined;
    },
  };
  const customSuggestions = getDriverModelSuggestions('custom-test-provider', mockRegistry as any);
  expect(customSuggestions).toEqual([
    { id: 'custom-model-alpha', name: 'Alpha Model', description: 'Test model', declaredInDriver: true },
  ]);
});
