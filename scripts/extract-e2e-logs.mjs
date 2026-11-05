import fs from 'fs';
import readline from 'readline';

async function scanLogs(filename, targetTimes) {
  if (!fs.existsSync(filename)) return [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filename),
    crlfDelay: Infinity,
  });
  const matches = [];
  for await (const line of rl) {
    try {
      const d = JSON.parse(line);
      const t = d.time || d.startedAt;
      if (d.method === 'POST' && targetTimes.includes(t)) {
        matches.push(d);
      }
    } catch {}
  }
  return matches;
}

const targetTimes = [
  '2026-11-05T22:22:39+09:00', // Novita
  '2026-11-05T22:54:38+09:00', // Fal.ai
  '2026-11-05T23:35:10+09:00', // Civitai (initial)
  '2026-11-06T00:09:20+09:00', // Civitai (clean)
];

const logs1 = await scanLogs('temp/logs/requests-2026-11-05.jsonl', targetTimes);
const logs2 = await scanLogs('temp/logs/requests-2026-11-06.jsonl', targetTimes);

const all = [...logs1, ...logs2];
console.log(`Extracted ${all.length} matching E2E POST logs:`);
for (const entry of all) {
  console.log('----------------------------------------------------');
  console.log(`Provider: ${entry.provider}`);
  console.log(`Time:     ${entry.time || entry.startedAt}`);
  console.log(`Endpoint: ${entry.endpoint}`);
  console.log(`Status:   ${entry.status}`);
  console.log(`Body:     ${JSON.stringify(entry.requestBody, null, 2)}`);
  console.log(`Response: ${typeof entry.responseBody === 'string' ? entry.responseBody : JSON.stringify(entry.responseBody)}`);
}
