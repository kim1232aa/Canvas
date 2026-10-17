import express from 'express';
import fs from 'node:fs';
import { registerSchemaProviderRoutes } from '/workspace/canvas/Canvas-main/src/server/schemaProviders.ts';
const env=Object.fromEntries(fs.readFileSync('/workspace/canvas/Canvas-main/.env','utf8').split('\n').filter(l=>/^KREA_API_KEY=/.test(l)).map(l=>[l.split('=')[0],l.slice(l.indexOf('=')+1).trim().replace(/^["']|["']$/g,'')]));
const KEYS=(env.KREA_API_KEY||'').split(',').map((s:string)=>s.trim()).filter(Boolean);const KEY=KEYS[Number(process.env.KREA_KEY_INDEX||0)]||'';
const app=express();app.use(express.json());
const history:any[]=[];
registerSchemaProviderRoutes(app,{fetch:(_m,u,i)=>fetch(u,i),key:()=>KEY,record:(x:any)=>{history.push(x);return x;},durable:async(url:string)=>({ok:true,dataUrl:url})});
const srv=app.listen(0,async()=>{
  const base=`http://127.0.0.1:${(srv.address() as any).port}`;const log:any={};
  const j=async(r:Response)=>({status:r.status,body:await r.json().catch(()=>null)});
  const cat=await j(await fetch(base+'/api/models?provider=krea&category=checkpoint&limit=100'));
  log.catalog={status:cat.status,count:cat.body?.pagination?.krea?.total,sample:(cat.body?.krea||[]).slice(0,8).map((m:any)=>[m.id,m.supportsLora]),error:cat.body?.error};
  const lcat=await j(await fetch(base+'/api/models?provider=krea&type=lora&model=flux_dev&limit=10'));
  log.loraCatalog={status:lcat.status,count:lcat.body?.pagination?.krea?.total,sample:(lcat.body?.krea||[]).slice(0,5).map((m:any)=>({id:m.id,name:m.name,base:m.baseModel})),error:lcat.body?.error,raw:lcat.body?.rawResponse};
  const lora=(lcat.body?.krea||[])[0];
  const sub=await j(await fetch(base+'/api/schema-provider/krea/submit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'image/bfl/flux-1-dev',prompt:'a lighthouse on a cliff at sunset, watercolor',width:1024,height:1024,steps:25,seed:42,loras:lora?[{name:lora.id,strength:0.8}]:[]})}));
  log.submit={status:sub.status,taskId:sub.body?.taskId,actualRequest:sub.body?.actualRequest,error:sub.body?.error,rawResponse:sub.body?.rawResponse};
  if(sub.body?.taskId){
    for(let i=0;i<90;i++){await new Promise(r=>setTimeout(r,3000));
      const p=await j(await fetch(base+sub.body.pollUrl));log.poll={status:p.status,taskStatus:p.body?.status,outputs:p.body?.outputs,error:p.body?.error,raw:p.body?.rawResponse};
      if(p.status!==200||['completed','failed','cancelled'].includes(p.body?.status))break;}
    if(log.poll?.taskStatus==='completed'){
      const s=await j(await fetch(base+'/api/schema-provider/krea/save-result',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({outputs:log.poll.outputs,metadata:{model:'image/bfl/flux-1-dev',loras:sub.body.actualRequest?.parameters?.styles,requestMetadata:{actualRequest:sub.body.actualRequest}}})}));
      log.save={status:s.status,history:history.map(h=>({provider:h.provider,model:h.model,loras:h.loras,url:h.url}))};
      for(const [i,u] of (log.poll.outputs||[]).entries()){const b=Buffer.from(await (await fetch(u)).arrayBuffer());fs.writeFileSync(`/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-krea/output-${i}.png`,b);}
    }
  }
  fs.writeFileSync('/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-krea/smoke-result.json',JSON.stringify(log,null,2));console.log(JSON.stringify(log,null,2).slice(0,6000));srv.close();
});
