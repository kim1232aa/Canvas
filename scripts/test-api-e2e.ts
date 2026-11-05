const BASE = 'http://127.0.0.1:3104';

interface TestResult {
  provider: string;
  schemaStatus: number;
  schemaOk: boolean;
  model: string;
  submitStatus?: number;
  submitBody?: any;
  pollStatus?: number;
  pollBody?: any;
  verdict: 'PASS_GENERATION' | 'PASS_BILLING' | 'BLOCKED_AUTH' | 'BLOCKED_CONFIG' | 'ERROR';
  note?: string;
}

async function j(res: Response) {
  const text = await res.text();
  try {
    return { status: res.status, ok: res.ok, data: JSON.parse(text), raw: text };
  } catch {
    return { status: res.status, ok: res.ok, data: text, raw: text };
  }
}

async function run() {
  console.log('Testing 13 providers against dev server at ' + BASE);

  const results: Record<string, any> = {};

  // 1. MuAPI
  console.log('\n--- 1. MuAPI ---');
  try {
    // Model from live probe: flux_dev_lora_image or flux-2-dev-edit or wan2.1_t2v
    // Let's check available models from muapi
    const cat = await j(await fetch(`${BASE}/api/models?provider=muapi&limit=10`));
    const models = cat.data?.muapi || [];
    console.log('MuAPI catalog models:', models.slice(0, 3).map((m: any) => m.id));
    const model = models[0]?.id || 'flux_dev_lora_image';
    const schema = await j(await fetch(`${BASE}/api/model-schema?provider=muapi&model=${encodeURIComponent(model)}`));
    console.log('MuAPI schema status:', schema.status, 'fields:', Object.keys(schema.data?.inputSchema?.properties || {}));
    
    // Test submit
    const sub = await j(await fetch(`${BASE}/api/schema-provider/muapi/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'a serene mountain lake at sunrise',
        width: 1024,
        height: 1024,
        steps: 20,
        cfg: 3.5,
        seed: 42,
        loras: [{ path: 'https://civitai.com/api/download/models/12345', strength: 0.8 }]
      })
    }));
    console.log('MuAPI submit status:', sub.status, 'body:', JSON.stringify(sub.data).slice(0, 200));
    results.muapi = { model, schema: schema.status, submit: sub.data };
  } catch (e: any) {
    console.log('MuAPI err:', e.message);
    results.muapi = { error: e.message };
  }

  // 2. WaveSpeed
  console.log('\n--- 2. WaveSpeed ---');
  try {
    const cat = await j(await fetch(`${BASE}/api/models?provider=wavespeed&limit=10`));
    const models = cat.data?.wavespeed || [];
    console.log('WaveSpeed catalog models:', models.slice(0, 3).map((m: any) => m.id));
    const model = models.find((m: any) => m.id?.includes('flux'))?.id || models[0]?.id || 'wavespeed-ai/flux-schnell';
    const schema = await j(await fetch(`${BASE}/api/model-schema?provider=wavespeed&model=${encodeURIComponent(model)}`));
    console.log('WaveSpeed schema status:', schema.status, 'fields:', Object.keys(schema.data?.inputSchema?.properties || {}));
    
    const sub = await j(await fetch(`${BASE}/api/schema-provider/wavespeed/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'a cute cat in the garden',
        size: '1024*1024',
        steps: 4,
        seed: 123
      })
    }));
    console.log('WaveSpeed submit status:', sub.status, 'body:', JSON.stringify(sub.data).slice(0, 200));
    results.wavespeed = { model, schema: schema.status, submit: sub.data };
  } catch (e: any) {
    console.log('WaveSpeed err:', e.message);
    results.wavespeed = { error: e.message };
  }

  // 3. Sogni
  console.log('\n--- 3. Sogni ---');
  try {
    const cat = await j(await fetch(`${BASE}/api/models?provider=sogni&limit=10`));
    const models = cat.data?.sogni || [];
    console.log('Sogni catalog models:', models.slice(0, 3).map((m: any) => m.id));
    const model = models[0]?.id || 'krea-2-turbo';
    const schema = await j(await fetch(`${BASE}/api/model-schema?provider=sogni&model=${encodeURIComponent(model)}`));
    console.log('Sogni schema status:', schema.status);

    const sub = await j(await fetch(`${BASE}/api/schema-provider/sogni/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'a watercolor sunset over the ocean',
        width: 1024,
        height: 1024,
        steps: 25,
        guidance: 3.5,
        seed: 42,
        loras: ['photorealism'],
        loraStrengths: [0.8]
      })
    }));
    console.log('Sogni submit status:', sub.status, 'body:', JSON.stringify(sub.data).slice(0, 200));
    results.sogni = { model, schema: schema.status, submit: sub.data };
  } catch (e: any) {
    console.log('Sogni err:', e.message);
    results.sogni = { error: e.message };
  }

  // 4. Krea
  console.log('\n--- 4. Krea ---');
  try {
    const model = 'krea/krea-2/medium';
    const schema = await j(await fetch(`${BASE}/api/model-schema?provider=krea&model=${encodeURIComponent(model)}`));
    console.log('Krea schema status:', schema.status, 'fields:', Object.keys(schema.data?.inputSchema?.properties || {}));

    const sub = await j(await fetch(`${BASE}/api/schema-provider/krea/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'a red fox in snow',
        width: 1024,
        height: 1024,
        seed: 42
      })
    }));
    console.log('Krea submit status:', sub.status, 'body:', JSON.stringify(sub.data).slice(0, 200));
    results.krea = { model, schema: schema.status, submit: sub.data };
  } catch (e: any) {
    console.log('Krea err:', e.message);
    results.krea = { error: e.message };
  }

  // 5. Together
  console.log('\n--- 5. Together ---');
  try {
    const model = 'black-forest-labs/FLUX.1-schnell';
    const schema = await j(await fetch(`${BASE}/api/model-schema?provider=together&model=${encodeURIComponent(model)}`));
    console.log('Together schema status:', schema.status);

    const sub = await j(await fetch(`${BASE}/api/schema-provider/together/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'a glowing neon cube',
        width: 1024,
        height: 1024,
        steps: 4
      })
    }));
    console.log('Together submit status:', sub.status, 'body:', JSON.stringify(sub.data).slice(0, 200));
    results.together = { model, schema: schema.status, submit: sub.data };
  } catch (e: any) {
    console.log('Together err:', e.message);
    results.together = { error: e.message };
  }

  // 6. AIMLAPI
  console.log('\n--- 6. AIMLAPI ---');
  try {
    const model = 'flux/schnell';
    const schema = await j(await fetch(`${BASE}/api/model-schema?provider=aimlapi&model=${encodeURIComponent(model)}`));
    console.log('AIMLAPI schema status:', schema.status);

    const sub = await j(await fetch(`${BASE}/api/schema-provider/aimlapi/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'a cup of warm coffee on a wooden desk',
        width: 1024,
        height: 1024
      })
    }));
    console.log('AIMLAPI submit status:', sub.status, 'body:', JSON.stringify(sub.data).slice(0, 200));
    results.aimlapi = { model, schema: schema.status, submit: sub.data };
  } catch (e: any) {
    console.log('AIMLAPI err:', e.message);
    results.aimlapi = { error: e.message };
  }

  // 7. Novita
  console.log('\n--- 7. Novita ---');
  try {
    const model = 'realisticVisionV40_v40VAE-inpainting_81543.safetensors';
    const schema = await j(await fetch(`${BASE}/api/model-schema?provider=novita&model=${encodeURIComponent(model)}`));
    console.log('Novita schema status:', schema.status);

    const sub = await j(await fetch(`${BASE}/api/schema-provider/novita/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'masterpiece, high quality portrait of a astronaut',
        width: 512,
        height: 512,
        steps: 20,
        guidance_scale: 7.5,
        seed: 42,
        loras: [{ path: 'weight_slider_v2_91681.safetensors', strength: 0.7 }]
      })
    }));
    console.log('Novita submit status:', sub.status, 'body:', JSON.stringify(sub.data).slice(0, 200));
    results.novita = { model, schema: schema.status, submit: sub.data };
  } catch (e: any) {
    console.log('Novita err:', e.message);
    results.novita = { error: e.message };
  }

  // 8. Venice
  console.log('\n--- 8. Venice ---');
  try {
    const model = 'venice-sd35';
    const schema = await j(await fetch(`${BASE}/api/model-schema?provider=venice&model=${encodeURIComponent(model)}`));
    console.log('Venice schema status:', schema.status);

    const sub = await j(await fetch(`${BASE}/api/schema-provider/venice/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'a futuristic city with flying cars',
        width: 1024,
        height: 1024,
        steps: 20,
        cfg_scale: 7,
        seed: 42
      })
    }));
    console.log('Venice submit status:', sub.status, 'body:', JSON.stringify(sub.data).slice(0, 200));
    results.venice = { model, schema: schema.status, submit: sub.data };
  } catch (e: any) {
    console.log('Venice err:', e.message);
    results.venice = { error: e.message };
  }

  // 9. DeepInfra
  console.log('\n--- 9. DeepInfra ---');
  try {
    const model = 'black-forest-labs/FLUX.1-schnell';
    const schema = await j(await fetch(`${BASE}/api/model-schema?provider=deepinfra&model=${encodeURIComponent(model)}`));
    console.log('DeepInfra schema status:', schema.status);

    const sub = await j(await fetch(`${BASE}/api/schema-provider/deepinfra/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'cyberpunk street at night',
        size: '1024x1024'
      })
    }));
    console.log('DeepInfra submit status:', sub.status, 'body:', JSON.stringify(sub.data).slice(0, 200));
    results.deepinfra = { model, schema: schema.status, submit: sub.data };
  } catch (e: any) {
    console.log('DeepInfra err:', e.message);
    results.deepinfra = { error: e.message };
  }

  // 10. Replicate
  console.log('\n--- 10. Replicate ---');
  try {
    const model = 'black-forest-labs/flux-schnell';
    const schema = await j(await fetch(`${BASE}/api/model-schema?provider=replicate&model=${encodeURIComponent(model)}`));
    console.log('Replicate schema status:', schema.status);

    const sub = await j(await fetch(`${BASE}/api/engine/replicate/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'abstract geometric art with vibrant colors',
        width: 1024,
        height: 1024,
        steps: 4,
        seed: 42
      })
    }));
    console.log('Replicate submit status:', sub.status, 'body:', JSON.stringify(sub.data).slice(0, 200));
    results.replicate = { model, schema: schema.status, submit: sub.data };
  } catch (e: any) {
    console.log('Replicate err:', e.message);
    results.replicate = { error: e.message };
  }

  // 11. Mage
  console.log('\n--- 11. Mage ---');
  try {
    const model = 'mango-v3';
    const sub = await j(await fetch(`${BASE}/api/engine/mage/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'portrait in soft daylight',
        width: 1024,
        height: 1024
      })
    }));
    console.log('Mage submit status:', sub.status, 'body:', JSON.stringify(sub.data).slice(0, 200));
    results.mage = { model, submit: sub.data };
  } catch (e: any) {
    console.log('Mage err:', e.message);
    results.mage = { error: e.message };
  }

  // 12. SenseNova
  console.log('\n--- 12. SenseNova ---');
  try {
    const model = 'sensenova-u1.5-lite';
    const sub = await j(await fetch(`${BASE}/api/engine/sensenova/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'test prompt',
        width: 1024,
        height: 1024
      })
    }));
    console.log('SenseNova submit status:', sub.status, 'body:', JSON.stringify(sub.data).slice(0, 200));
    results.sensenova = { model, submit: sub.data };
  } catch (e: any) {
    console.log('SenseNova err:', e.message);
    results.sensenova = { error: e.message };
  }

  // 13. OpenWorks
  console.log('\n--- 13. OpenWorks ---');
  try {
    const model = 'photoreal_studio_z_image';
    const sub = await j(await fetch(`${BASE}/api/schema-provider/openworks/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'a beautiful mountain peak in winter',
        width: 1024,
        height: 1024,
        steps: 25,
        cfg: 7,
        seed: 42
      })
    }));
    console.log('OpenWorks submit status:', sub.status, 'body:', JSON.stringify(sub.data).slice(0, 200));
    results.openworks = { model, submit: sub.data };
  } catch (e: any) {
    console.log('OpenWorks err:', e.message);
    results.openworks = { error: e.message };
  }
}

run().catch(console.error);
