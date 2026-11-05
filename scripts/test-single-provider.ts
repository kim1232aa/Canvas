import fs from 'node:fs';
import path from 'node:path';

const envContent = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
const env: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) {
    env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
}

async function testMuapi() {
  console.log('\n--- Testing MuAPI ---');
  const key = env.MUAPI_KEY;
  // Get models
  const res = await fetch('https://api.muapi.ai/api/v1/models', {
    headers: { 'x-api-key': key }
  });
  const data: any = await res.json();
  const models = data.models || [];
  console.log('MuAPI models count:', models.length);
  // Pick an image model, e.g. flux-schnell or sd or similar
  const imageModels = models.filter((m: any) => !m.category?.toLowerCase().includes('video') && !m.name?.includes('video'));
  console.log('Sample image models:', imageModels.slice(0, 5).map((m: any) => m.name));
  const targetModel = imageModels.find((m: any) => m.name.includes('flux')) || imageModels[0];
  console.log('Target model:', targetModel);
}

async function testWaveSpeed() {
  console.log('\n--- Testing WaveSpeed ---');
  const key = env.WAVESPEED_KEY;
  const res = await fetch('https://api.wavespeed.ai/api/v3/models', {
    headers: { 'Authorization': `Bearer ${key}` }
  });
  const data: any = await res.json();
  const models = data.data || [];
  console.log('WaveSpeed models count:', models.length);
  const imageModels = models.filter((m: any) => m.type?.includes('image') || m.type === 'text-to-image');
  console.log('Sample image models:', imageModels.slice(0, 5).map((m: any) => m.model_id));
}

async function testSogni() {
  console.log('\n--- Testing Sogni ---');
  const key = env.SOGNI_KEY;
  const res = await fetch('https://api.sogni.ai/v1/model-catalog?mediaType=image&network=fast', {
    headers: { 'Authorization': `Bearer ${key}` }
  });
  const data: any = await res.json();
  const models = data.data?.models || [];
  console.log('Sogni image models count:', models.length);
  console.log('Sample Sogni models:', models.slice(0, 5).map((m: any) => m.id));
}

async function testKrea() {
  console.log('\n--- Testing Krea ---');
  const key = env.KREA_API_KEY;
  const res = await fetch('https://api.krea.ai/openapi.json', {
    headers: { 'Authorization': `Bearer ${key}` }
  });
  const doc: any = await res.json();
  const paths = Object.keys(doc.paths || {}).filter(p => p.startsWith('/generate/image'));
  console.log('Krea image generation paths:', paths);
}

async function testAIMLAPI() {
  console.log('\n--- Testing AIMLAPI ---');
  const key = env.AIMLAPI_KEY;
  const res = await fetch('https://api.aimlapi.com/v1/models', {
    headers: { 'Authorization': `Bearer ${key}` }
  });
  const data: any = await res.json();
  const models = (data.data || []).filter((m: any) => m.id?.includes('flux') || m.id?.includes('image'));
  console.log('AIMLAPI image models count:', models.length);
  console.log('Sample AIMLAPI models:', models.slice(0, 5).map((m: any) => m.id));
}

async function testNovita() {
  console.log('\n--- Testing Novita ---');
  const key = env.NOVITA_API_KEY;
  const res = await fetch('https://api.novita.ai/v3/model?filter.types=checkpoint&filter.visibility=public&pagination.limit=5', {
    headers: { 'Authorization': `Bearer ${key}` }
  });
  const data: any = await res.json();
  console.log('Novita models count:', data.models?.length);
  console.log('Sample Novita models:', (data.models || []).map((m: any) => m.sd_name || m.name));
}

async function testVenice() {
  console.log('\n--- Testing Venice ---');
  const key = env.VENICE_API_KEY;
  const res = await fetch('https://api.venice.ai/api/v1/models?type=image', {
    headers: { 'Authorization': `Bearer ${key}` }
  });
  const data: any = await res.json();
  console.log('Venice image models:', (data.data || []).map((m: any) => m.id));
}

async function testDeepInfra() {
  console.log('\n--- Testing DeepInfra ---');
  const key = env.DEEPINFRA_API_KEY;
  const res = await fetch('https://api.deepinfra.com/models/list?type=text-to-image', {
    headers: { 'Authorization': `Bearer ${key}` }
  });
  const data: any = await res.json();
  console.log('DeepInfra text-to-image models count:', data.length);
  console.log('Sample DeepInfra models:', data.slice(0, 5).map((m: any) => m.model_name));
}

async function testOpenWorks() {
  console.log('\n--- Testing OpenWorks ---');
  const key = env.TENSORART_API_KEY || env.TENSORART_KEY;
  const baseUrl = key.startsWith('ak_tusi') ? 'https://openapi.tusiart.cn/openworks/v1' : 'https://openapi.tensor.art/openworks/v1';
  const res = await fetch(`${baseUrl}/tool/list`, {
    method: 'POST',
    headers: {
      'Echo-Access-Key': key,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  const data: any = await res.json();
  const tools = data.data?.tools || [];
  console.log('OpenWorks tools count:', tools.length);
  console.log('Sample OpenWorks tools:', tools.slice(0, 5).map((t: any) => t.name));
}

async function main() {
  await testMuapi();
  await testWaveSpeed();
  await testSogni();
  await testKrea();
  await testAIMLAPI();
  await testNovita();
  await testVenice();
  await testDeepInfra();
  await testOpenWorks();
}

main().catch(console.error);
