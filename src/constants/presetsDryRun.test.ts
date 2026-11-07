import { describe, it, expect } from 'vitest';
import { WORKFLOW_PRESETS } from './presets';
import { NODE_DEFINITIONS } from './nodes';
import { PRESET_RECIPE_PROMPTS } from './presetRecipePrompts';
import { extractWorkflowParameters, modelChainBreak, resolveRunTarget } from '../utils/graphEngine';

/** Dry-run lever: every std preset, loaded as-is, must resolve to a runnable request (no network). */
/** Official required fields (live Schema GET 2026-11-04 via /api/model-schema) mapped to extraction keys. */
const REQUIRED: Record<string, string[]> = {
  'std-krea-t2i': ['aspectRatio', 'resolution'],
  'std-agnes-t2i': ['size'],
  'std-mage-t2i': ['aspectRatio', 'resolution'],
};
const std = WORKFLOW_PRESETS.filter((p) => p.id.startsWith('std-'));
const rows: string[] = [];

describe('std presets dry-run (load → extract, no send)', () => {
  for (const p of std) {
    it(p.id, () => {
      const issues: string[] = []; const notes: string[] = [];
      // graph: every connection's sockets exist and types are the node-defined ones
      for (const c of p.connections) {
        const from = p.nodes.find((n) => n.id === c.fromNodeId);
        const to = p.nodes.find((n) => n.id === c.toNodeId);
        if (!from || !to) { issues.push(`dangling ${c.id}`); continue; }
        const outT = (NODE_DEFINITIONS as any)[from.type]?.outputs?.find((o: any) => o.id === c.fromSocketId || o.name === c.fromSocketId)?.type;
        const inT = (NODE_DEFINITIONS as any)[to.type]?.inputs?.find((o: any) => o.id === c.toSocketId || o.name === c.toSocketId)?.type;
        if (outT && inT && outT !== inT && !(inT === '*' || outT === '*')) issues.push(`${from.type}.${c.fromSocketId}(${outT})→${to.type}.${c.toSocketId}(${inT})`);
      }
      // required (non-optional) inputs connected
      for (const n of p.nodes) for (const i of ((NODE_DEFINITIONS as any)[n.type]?.inputs || [])) {
        if (i.optional || ['image','negative'].includes(i.id) || (n.type==='AIVideoNode' && (i.id==='positive' || i.id==='lora' || i.id==='init_image')) || (n.type==='LoRALoader' && p.nodes.some((v) => v.type==='AIVideoNode')) || (n.type==='GoogleImagenNode' && i.id==='negative') || (n.type==='CLIPTextEncode' && p.id==='std-gemini-t2i' && i.id==='clip')) continue;
        if (!p.connections.some((c) => c.toNodeId === n.id && c.toSocketId === i.id)) issues.push(`unconnected ${n.type}.${i.id}`);
      }
      const emptyPrompt = !p.nodes.some((n) => String(n.values?.text ?? n.values?.prompt ?? '').trim());
      const hasRecipe = Boolean(PRESET_RECIPE_PROMPTS[p.id]);
      if (hasRecipe === emptyPrompt) issues.push(hasRecipe ? 'recipe prompt not loaded' : 'prompt filled without a recipe');
      // No recipe → loads empty and extraction succeeds with exactly empty string (no fallback prompt).
      // A pendingRecipe card is the exception: it is built to refuse the run, so the throw is the expected result.
      if (!hasRecipe && !p.pendingRecipe) {
        try {
          const testNodes = p.nodes.map((n) => ({ ...n, values: { ...n.values, ...(n.type === 'LoadImage' ? { image_url: 'https://example.com/ref.png' } : {}), ...(n.type === 'CheckpointLoaderSimple' && !n.values?.ckpt_name ? { ckpt_name: 'USER_SELECTED_MODEL' } : {}), ...(n.type === 'AIVideoNode' && !n.values?.model ? { model: 'USER_SELECTED_MODEL' } : {}) } }));
          const rawExtracted = extractWorkflowParameters(testNodes as any, p.connections as any, resolveRunTarget(testNodes as any, p.connections as any, undefined, undefined).id);
          if (rawExtracted.positivePrompt !== '') issues.push(`empty prompt got unexpected non-empty content: "${rawExtracted.positivePrompt}"`);
        } catch (e: any) {
          issues.push(`empty prompt extraction threw unexpectedly: ${e.message}`);
        }
      }
      notes.push(`prompt: ${PRESET_RECIPE_PROMPTS[p.id]?.source ?? 'NONE'}`);
      // Simulate only the user-supplied input a preset cannot ship: the I2V reference image or user-selected model.
      const nodes = p.nodes.map((n) => ({ ...n, values: { ...n.values,
        ...(n.type === 'LoadImage' ? { image_url: 'https://example.com/ref.png' } : {}),
        // Simulate the user typing a prompt into an empty (no-recipe) preset; test-only, never shipped.
        ...(!hasRecipe && n.type === 'CLIPTextEncode' ? { text: 'USER_TYPED_TEST_PROMPT' } : {}),
        ...(!hasRecipe && n.type === 'AIVideoNode' ? { prompt: 'USER_TYPED_TEST_PROMPT' } : {}),
        ...(n.type === 'CheckpointLoaderSimple' && !n.values?.ckpt_name ? { ckpt_name: 'USER_SELECTED_MODEL' } : {}),
        ...(n.type === 'AIVideoNode' && !n.values?.model ? { model: 'USER_SELECTED_MODEL' } : {}) } }));
      let tid: string | undefined;
      try { tid = resolveRunTarget(nodes as any, p.connections as any, undefined, undefined).id; } catch (e: any) { issues.push(`run target: ${e.message}`); }
      let req: string = 'n/a';
      try {
        // Same as App.tsx chainExecId: chain check runs on the KSampler only.
        const ks = nodes.find((n) => n.type === 'KSampler');
        const brk = ks ? modelChainBreak(nodes as any, p.connections as any, ks.id) : undefined;
        if (brk) issues.push(`chain: ${brk}`);
        if (p.pendingRecipe) {
          // A 待配方 card must refuse to run and say why, not silently extract a sendable request.
          // A card that also mounts an unverified LoRA is stopped by the unresolved-resource check first;
          // the pending reason still has to be present in that message or on the card itself.
          let thrown = '';
          try { extractWorkflowParameters(nodes as any, p.connections as any, tid); }
          catch (e: any) { thrown = String(e?.message ?? e); }
          const blocked = thrown.includes(p.pendingRecipe) || /未核实资源/.test(thrown);
          if (!blocked) issues.push(`pendingRecipe card did not block the run: ${thrown || 'extracted a request'}`);
          notes.push(`pendingRecipe blocks run (${thrown.slice(0, 80)})`);
          rows.push(`| ${p.id} | ${issues.length ? 'FAIL' : 'BLOCKED'} | - | ${issues.join('; ') || '-'} | ${notes.join('; ')} |`);
          expect(issues, p.id).toEqual([]);
          return;
        }
        const x = extractWorkflowParameters(nodes as any, p.connections as any, tid);
        if (!x.targetProvider) issues.push('no provider');
        if (!x.checkpointModel) issues.push('no model');
        req = `${x.targetProvider}/${x.checkpointModel} loras=${x.loras.map((l) => l.name).join('|') || '-'} w=${x.width ?? '-'} h=${x.height ?? '-'} steps=${x.steps ?? '-'} cfg=${x.cfg ?? '-'} ar=${x.aspectRatio ?? '-'} size=${x.size ?? x.imageSize ?? '-'} res=${x.resolution ?? '-'} neg=${x.negativePrompt ? 'y' : '-'}`;
        if (x.executionBlockedReason) notes.push(`preset carries local block: ${x.executionBlockedReason}`);
        const reqF = REQUIRED[p.id]; if (reqF) for (const f of reqF) if ((x as any)[f] === undefined || (x as any)[f] === '') issues.push(`official required ${f} missing`);
      } catch (e: any) { issues.push(`extract threw: ${e.message}`); }
      rows.push(`| ${p.id} | ${issues.length ? 'FAIL' : 'OK'} | ${req} | ${issues.join('; ') || '-'} | ${notes.join('; ') || '-'} |`);
      expect(issues, p.id).toEqual([]);
    });
  }
  it("print table", () => { if (process.env.DRY_TABLE) console.log("\n" + rows.join("\n")); });
});

describe('HF standard preset dry-run builds a sendable request', () => {
  it('std-huggingface-t2i: seed/steps/size present without a routing field', () => {
    const p0 = WORKFLOW_PRESETS.find((x) => x.id === 'std-huggingface-t2i')!;
    const p = { ...p0, nodes: p0.nodes.map((n) => (n.type === 'CLIPTextEncode' ? { ...n, values: { ...n.values, text: 'USER_TYPED_TEST_PROMPT' } } : n)) };
    const tid = resolveRunTarget(p.nodes as any, p.connections as any, undefined, undefined).id;
    const x: any = extractWorkflowParameters(p.nodes as any, p.connections as any, tid);
    expect(x.targetProvider).toBe('huggingface');
    expect(x.hfProvider).toBeUndefined();
    expect(typeof x.seed).toBe('number');
    expect(x.steps).toBe(12);
    expect([x.width, x.height]).toEqual([1216, 832]);
  });
});
