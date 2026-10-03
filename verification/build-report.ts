import {readFile, writeFile} from 'node:fs/promises';
import {NODE_DEFINITIONS} from '../src/constants/nodes';
import {extractWorkflowParameters} from '../src/utils/graphEngine';
import type {NodeInstance, Connection} from '../src/types/graph';

const root = 'public/verification';
const results: any[] = JSON.parse(await readFile(`${root}/results.json`, 'utf8'));
const labels: Record<string, string> = {generated: '已实际出图', billing_or_quota: '计费 / 额度限制', rejected: '上游明确拒绝', credentials_rejected:'模型 API 鉴权失败', account_setup: '账户需设置', pending: '仍在处理中', network_or_runtime: '网络 / 运行限制'};
let disabledLora = 0;
for (const result of results) {
  if (/TOP_UP/i.test(result.response?.error || '')) result.status = 'billing_or_quota';
  if (/bind your Alibaba Cloud/i.test(result.response?.error || '')) result.status = 'account_setup';
  if (result.name === 'civitai-lora' && result.status !== 'generated') result.name = `civitai-lora-disabled-${++disabledLora}`;
  if (/unauthorized|app not found|invalid_api_key/i.test(JSON.stringify(result.response))) result.status='credentials_rejected';
  if (result.status !== 'generated') continue;
  const body = result.request;
  const provider = result.name.startsWith('tensorart') ? 'tensorart' : result.name.startsWith('civitai') ? 'civitai' : 'huggingface';
  const toolValues: Record<string, any> = {};
  if (provider === 'tensorart') {
    // Archived tool outputs are evidence, not model workflows executable in the current canvas.
    delete result.replayWorkflow;
    await writeFile(`${root}/${result.name}-workflow.json`, JSON.stringify({kind:'openworks-tool-request',request:body,submittedWorkflow:result.workflowSnapshot,requestMetadata:result.response?.historyItem?.requestMetadata},null,2));
    await writeFile(`${root}/${result.name}-parameters.json`,JSON.stringify({request:body,requestMetadata:result.response?.historyItem?.requestMetadata},null,2));
    continue;
  }
  const node = (id: string, type: string, values: Record<string, unknown>, x: number, y: number): NodeInstance => ({id, type, title: NODE_DEFINITIONS[type].title, pos:{x,y}, width:300, inputs:NODE_DEFINITIONS[type].inputs, outputs:NODE_DEFINITIONS[type].outputs, values, state:'idle'});
  const nodes = [node('checkpoint', 'CheckpointLoaderSimple', {ckpt_name:body.model, targetProvider:provider, resolution:body.resolution, shift:body.shift, random_seed:body.random_seed, gallery_images:body.gallery_images, hf_provider:body.inference_provider}, 20, 20), node('prompt', 'CLIPTextEncode', {text:body.prompt || toolValues.prompt}, 350, 20), node('sampler', 'KSampler', {seed:body.seed, control_after_generate:'fixed', steps:body.steps ?? body.num_inference_steps, cfg:body.cfg ?? body.guidance_scale ?? body.guidance, sampler_name:body.sampler_name, scheduler:body.scheduler}, 700, 20)];
  const connections: Connection[] = [{id:'model',fromNodeId:'checkpoint',fromSocketId:'MODEL',toNodeId:'sampler',toSocketId:'model',type:'MODEL'}, {id:'positive',fromNodeId:'prompt',fromSocketId:'CONDITIONING',toNodeId:'sampler',toSocketId:'positive',type:'CONDITIONING'}, {id:'clip',fromNodeId:'checkpoint',fromSocketId:'CLIP',toNodeId:'prompt',toSocketId:'clip',type:'CLIP'}];
  if (body.width || toolValues['image width']) {
    nodes.push(node('latent', 'EmptyLatentImage', {width:body.width || toolValues['image width'], height:body.height || toolValues['image height'], batch_size:toolValues['result image count'] ?? 1}, 350, 400));
    connections.push({id:'latent',fromNodeId:'latent',fromSocketId:'LATENT',toNodeId:'sampler',toSocketId:'latent_image',type:'LATENT'});
  }
  if (body.negative_prompt) {
    nodes.push(node('negative', 'CLIPTextEncodeNegative', {text:body.negative_prompt}, 20, 650));
    connections.push({id:'negative',fromNodeId:'negative',fromSocketId:'CONDITIONING',toNodeId:'sampler',toSocketId:'negative',type:'CONDITIONING'});
  }
  for (const [index, lora] of (body.loras || []).entries()) {
    const id = `lora-${index}`;
    nodes.push(node(id, 'LoRALoader', {lora_name:lora.name, civitai_id:lora.civitaiId, strength_model:lora.strength, strength_clip:lora.strength}, 20, 350 + index * 280));
    const previous = connections.find(c => c.id === 'model')!;
    connections.push({id:`lora-model-${index}`,fromNodeId:previous.fromNodeId,fromSocketId:'MODEL',toNodeId:id,toSocketId:'model',type:'MODEL'});
    previous.fromNodeId = id;
  }
  const extracted = extractWorkflowParameters(nodes, connections, 'sampler');
  if (extracted.targetProvider !== provider || extracted.checkpointModel !== body.model) throw new Error('Replay workflow changed the selected provider/model');
  if (body.loras?.length && (extracted.loras.length !== body.loras.length || extracted.loras[0].modelStrength !== body.loras[0].strength)) throw new Error('Replay workflow changed LoRA weights');
  const replayWorkflow = {format:'comfycanvas', version:1, nodes, connections, canvasMode:'graph', spatialFrames:[], executingNodeId:'sampler'};
  result.replayWorkflow = replayWorkflow;
  await writeFile(`${root}/${result.name}-workflow.json`, JSON.stringify(replayWorkflow, null, 2));
  await writeFile(`${root}/${result.name}-parameters.json`, JSON.stringify({request:body, requestMetadata:result.response?.historyItem?.requestMetadata, seed:result.response?.historyItem?.seed, loras:result.response?.historyItem?.loras}, null, 2));
}
await writeFile(`${root}/results.json`, JSON.stringify(results, null, 2));
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const cards = results.map((r, index) => `<article><div class="head"><h2>${esc(r.name)}</h2><span class="badge ${r.status === 'generated' ? 'ok' : 'limited'}">${esc(labels[r.status])}</span></div><p class="model">${esc(r.model)}</p>${r.mediaUrl ? `<a href="${esc(r.mediaUrl)}"><img src="${esc(r.mediaUrl)}" alt="${esc(r.name)} 的真实生成结果" loading="lazy"></a>` : `<p class="error">${esc(r.response?.error || r.message || '未返回图片')}</p>`}<p>HTTP ${esc(r.http)} · ${esc(r.startedAt)}</p>${r.mediaUrl ? `<div class="actions"><a href="${esc(r.mediaUrl)}" download>下载图片</a><a href="${esc(r.name)}-parameters.json" download>实际参数</a><a href="${esc(r.name)}-workflow.json" download>工作流 JSON</a>${r.replayWorkflow ? `<button data-open="${index}">在画布打开</button>` : `<span>旧 OpenWorks 工具记录，不作为模型工作流导入</span>`}</div><p>LoRA: ${esc(r.response?.historyItem?.loras?.length ? r.response.historyItem.loras.map((l: any) => `${l.name} × ${l.strength}`).join('；') : '未使用')}</p>` : ''}<details><summary>请求、端点与工作流记录</summary><pre>${esc(JSON.stringify({request:r.request, upstream:r.response?.historyItem?.requestMetadata, submittedWorkflow:r.workflowSnapshot, replayWorkflow:r.replayWorkflow, response:r.response}, null, 2))}</pre></details></article>`).join('');
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>真实生成验收 · ComfyCanvas</title><style>*{box-sizing:border-box}body{margin:0;background:#10141b;color:#e7edf5;font:15px/1.6 system-ui,sans-serif}main{max-width:1220px;margin:auto;padding:36px 24px}h1{font-size:30px;margin:8px 0}h2{font-size:17px;margin:0}header{margin-bottom:30px}a{color:#67e8f9}header p{max-width:850px;color:#b4c2d3}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,350px),1fr));gap:20px}article{background:#1a202b;border:1px solid #334155;border-radius:18px;padding:18px;overflow:hidden}.head{display:flex;justify-content:space-between;gap:8px;align-items:center}.badge{font-size:12px;padding:3px 8px;border-radius:6px;white-space:nowrap}.ok{background:#164e42;color:#a7f3d0}.limited{background:#493717;color:#fde68a}.model{color:#b4c2d3;word-break:break-all;font-size:13px;min-height:42px}img{width:100%;aspect-ratio:1;object-fit:contain;background:#0b1018;border-radius:10px}article p{font-size:12px;word-break:break-word;color:#b4c2d3}.error{padding:16px;background:#211f23;border-radius:10px;min-height:100px}.actions{display:flex;flex-wrap:wrap;gap:8px}.actions a,button{font:inherit;font-size:12px;color:#cffafe;background:#163743;border:1px solid #2c687d;border-radius:7px;padding:7px 9px;text-decoration:none;cursor:pointer}details{margin-top:14px}summary{cursor:pointer;color:#93c5fd;font-size:13px}pre{max-height:350px;overflow:auto;white-space:pre-wrap;word-break:break-all;font:11px/1.6 monospace;background:#10141b;padding:12px;border-radius:9px}a:focus-visible,button:focus-visible{outline:2px solid #67e8f9;outline-offset:3px}</style><main><header><a href="/">← 返回工作室</a><h1>真实生成验收</h1><p>验收记录通过与网站相同的 Worker 后端调用真实服务商，共返回 ${results.filter(r => r.status === 'generated').length} 张图片。计费限制、账户设置和接口拒绝分别记录。图片附实际发送的参数、端点与提交时的工作流快照；可复用的画布工作流另附下载。其中 Tensor 的两张旧结果来自 OpenWorks 工具，不能证明 TAMS 模型 API 已打通。未实测的视频、图生图与其他模型不在出图验收范围。</p><p>模型 / 参数官方依据：<a href="https://developer.civitai.com/orchestration/recipes/sd1.md">Civitai</a> · <a href="https://huggingface.co/spaces/Tongyi-MAI/Z-Image-Turbo">Hugging Face Space</a> · <a href="https://github.com/Tensor-Art/tensorart-skills">Tensor.Art</a> · <a href="results.json" download>完整记录 JSON</a></p><p><a href="provider-audit.html">查看全部供应商审计与当前限制</a></p><p id="notice" role="status"></p></header><section class="grid">${cards}</section></main><script type="module">const results=await (await fetch('results.json')).json();document.querySelectorAll('[data-open]').forEach(button=>button.addEventListener('click',()=>{try{const r=results[Number(button.dataset.open)],key='comfycanvas_boards_v2';const boards=JSON.parse(localStorage.getItem(key)||'[]');const id='verification-'+r.name;const project={...r.replayWorkflow,id,name:'验收 · '+r.name,createdAt:Date.now(),updatedAt:Date.now(),transform:{x:80,y:160,scale:.7}};localStorage.setItem(key,JSON.stringify([...boards.filter(b=>b.id!==id),project]));localStorage.setItem('comfycanvas_active_board_v2',id);localStorage.setItem('comfycanvas_mode_v2','graph');location.href='/';}catch(error){document.getElementById('notice').textContent='打开工作流失败：'+error.message;}}));</script></html>`;
await writeFile(`${root}/index.html`, html);
console.log(`Verification report created with ${results.filter(r => r.status === 'generated').length} actual outputs; replay provider/model/LoRA checks passed.`);
