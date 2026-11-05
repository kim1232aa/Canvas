import fs from 'node:fs';
import path from 'node:path';

// Load .env
const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) {
    env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
}

function mask(key?: string): string {
  if (!key) return '(none)';
  if (key.length <= 8) return '***';
  return key.slice(0, 4) + '...' + key.slice(-4);
}

async function testProvider(name: string, fn: () => Promise<any>) {
  process.stdout.write(`Testing ${name}... `);
  try {
    const res = await fn();
    console.log(`[OK]`, res);
  } catch (err: any) {
    console.log(`[ERR]`, err.message || err);
  }
}

async function main() {
  console.log('--- Probing 13 Providers ---');

  // 1. MuAPI
  const muapiKey = env.MUAPI_KEY;
  await testProvider(`1. muapi (key: ${mask(muapiKey)})`, async () => {
    if (!muapiKey) return 'No key';
    const res = await fetch('https://api.muapi.ai/api/v1/models', {
      headers: { 'x-api-key': muapiKey },
      signal: AbortSignal.timeout(10000)
    });
    const text = await res.text();
    return `HTTP ${res.status}: ${text.slice(0, 150)}`;
  });

  // 2. WaveSpeed
  const waveKey = env.WAVESPEED_KEY;
  await testProvider(`2. wavespeed (key: ${mask(waveKey)})`, async () => {
    if (!waveKey) return 'No key';
    const res = await fetch('https://api.wavespeed.ai/api/v3/models', {
      headers: { 'Authorization': `Bearer ${waveKey}` },
      signal: AbortSignal.timeout(10000)
    });
    const text = await res.text();
    return `HTTP ${res.status}: ${text.slice(0, 150)}`;
  });

  // 3. Sogni
  const sogniKey = env.SOGNI_KEY;
  await testProvider(`3. sogni (key: ${mask(sogniKey)})`, async () => {
    if (!sogniKey) return 'No key';
    const res = await fetch('https://api.sogni.ai/v1/model-catalog?mediaType=image&network=fast', {
      headers: { 'Authorization': `Bearer ${sogniKey}` },
      signal: AbortSignal.timeout(10000)
    });
    const text = await res.text();
    return `HTTP ${res.status}: ${text.slice(0, 150)}`;
  });

  // 4. Krea
  const kreaKey = env.KREA_API_KEY;
  await testProvider(`4. krea (key: ${mask(kreaKey)})`, async () => {
    if (!kreaKey) return 'No key';
    const res = await fetch('https://api.krea.ai/openapi.json', {
      headers: { 'Authorization': `Bearer ${kreaKey}` },
      signal: AbortSignal.timeout(10000)
    });
    const text = await res.text();
    return `HTTP ${res.status}: ${text.slice(0, 150)}`;
  });

  // 5. Together
  const togetherKey = env.TOGETHER_API_KEY;
  await testProvider(`5. together (key: ${mask(togetherKey)})`, async () => {
    if (!togetherKey) return 'No key';
    const res = await fetch('https://api.together.ai/v1/models', {
      headers: { 'Authorization': `Bearer ${togetherKey}` },
      signal: AbortSignal.timeout(10000)
    });
    const text = await res.text();
    return `HTTP ${res.status}: ${text.slice(0, 150)}`;
  });

  // 6. AIMLAPI
  const aimlapiKey = env.AIMLAPI_KEY;
  await testProvider(`6. aimlapi (key: ${mask(aimlapiKey)})`, async () => {
    if (!aimlapiKey) return 'No key';
    const res = await fetch('https://api.aimlapi.com/v1/models', {
      headers: { 'Authorization': `Bearer ${aimlapiKey}` },
      signal: AbortSignal.timeout(10000)
    });
    const text = await res.text();
    return `HTTP ${res.status}: ${text.slice(0, 150)}`;
  });

  // 7. Novita
  const novitaKey = env.NOVITA_API_KEY;
  await testProvider(`7. novita (key: ${mask(novitaKey)})`, async () => {
    if (!novitaKey) return 'No key';
    const res = await fetch('https://api.novita.ai/v3/model?filter.types=checkpoint&filter.visibility=public&pagination.limit=5', {
      headers: { 'Authorization': `Bearer ${novitaKey}` },
      signal: AbortSignal.timeout(10000)
    });
    const text = await res.text();
    return `HTTP ${res.status}: ${text.slice(0, 150)}`;
  });

  // 8. Venice
  const veniceKey = env.VENICE_API_KEY;
  await testProvider(`8. venice (key: ${mask(veniceKey)})`, async () => {
    if (!veniceKey) return 'No key';
    const res = await fetch('https://api.venice.ai/api/v1/models?type=image', {
      headers: { 'Authorization': `Bearer ${veniceKey}` },
      signal: AbortSignal.timeout(10000)
    });
    const text = await res.text();
    return `HTTP ${res.status}: ${text.slice(0, 150)}`;
  });

  // 9. DeepInfra
  const deepinfraKey = env.DEEPINFRA_API_KEY;
  await testProvider(`9. deepinfra (key: ${mask(deepinfraKey)})`, async () => {
    if (!deepinfraKey) return 'No key';
    const res = await fetch('https://api.deepinfra.com/models/list?type=text-to-image', {
      headers: { 'Authorization': `Bearer ${deepinfraKey}` },
      signal: AbortSignal.timeout(10000)
    });
    const text = await res.text();
    return `HTTP ${res.status}: ${text.slice(0, 150)}`;
  });

  // 10. Replicate
  const repKey = env.REPLICATE_API_TOKEN || env.REPLICATE_API_KEY;
  await testProvider(`10. replicate (key: ${mask(repKey)})`, async () => {
    if (!repKey) return 'No key';
    const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell', {
      headers: { 'Authorization': `Bearer ${repKey}` },
      signal: AbortSignal.timeout(10000)
    });
    const text = await res.text();
    return `HTTP ${res.status}: ${text.slice(0, 150)}`;
  });

  // 11. Mage
  const mageKey = env.MAGE_API_KEY || env.MAGE_KEY;
  await testProvider(`11. mage (key: ${mask(mageKey)})`, async () => {
    if (!mageKey) return 'No key';
    // Mage has no public catalog endpoint, test POST with invalid or minimal params or probe
    const res = await fetch('https://api.mage.space/v1/mango/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mageKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt: 'test probe' }),
      signal: AbortSignal.timeout(10000)
    });
    const text = await res.text();
    return `HTTP ${res.status}: ${text.slice(0, 150)}`;
  });

  // 12. SenseNova
  const senseKey = env.SENSENOVA_API_KEY || env.SENSENOVA_KEY;
  await testProvider(`12. sensenova (key: ${mask(senseKey)})`, async () => {
    if (!senseKey) return 'BLOCKED_CONFIG: no key in .env';
    const res = await fetch('https://token.sensenova.cn/v1/models', {
      headers: { 'Authorization': `Bearer ${senseKey}` },
      signal: AbortSignal.timeout(10000)
    });
    const text = await res.text();
    return `HTTP ${res.status}: ${text.slice(0, 150)}`;
  });

  // 13. OpenWorks
  const openworksKey = env.TENSORART_API_KEY || env.TENSORART_KEY;
  await testProvider(`13. openworks (key: ${mask(openworksKey)})`, async () => {
    if (!openworksKey) return 'No key';
    const baseUrl = openworksKey.startsWith('ak_tusi') ? 'https://openapi.tusiart.cn/openworks/v1' : 'https://openapi.tensor.art/openworks/v1';
    const res = await fetch(`${baseUrl}/tool/list`, {
      method: 'POST',
      headers: {
        'Echo-Access-Key': openworksKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10000)
    });
    const text = await res.text();
    return `HTTP ${res.status}: ${text.slice(0, 150)}`;
  });
}

main().catch(console.error);
