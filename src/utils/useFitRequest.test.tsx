// @vitest-environment jsdom
// Load-only UI 2026-11-04: loading Fal/WaveSpeed/MuAPI/… I2V presets one after another left zoom at 100% because the
// queued fit (setTimeout(handleResetView)) measured the PREVIOUS preset's nodes. Fit must see the freshly loaded nodes.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { useFitRequest } from './useFitRequest';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('useFitRequest', () => {
  it('fit after a preset replace sees the new node set, on every load', async () => {
    const fittedWith: string[][] = [];
    let load: (ids: string[]) => void = () => {};
    function Board() {
      const [nodes, setNodes] = useState<string[]>(['novita-load', 'novita-vid', 'novita-save']);
      const requestFit = useFitRequest(() => fittedWith.push(nodes));
      load = (ids) => { setNodes(ids); requestFit(); };
      return null;
    }
    const el = document.createElement('div');
    const root = createRoot(el);
    await act(async () => root.render(<Board />));
    for (const p of ['fal', 'wavespeed', 'muapi', 'civitai', 'replicate']) {
      await act(async () => load([`${p}-load`, `${p}-vid`, `${p}-save`]));
      await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    }
    expect(fittedWith.map((n) => n[1])).toEqual(['fal-vid', 'wavespeed-vid', 'muapi-vid', 'civitai-vid', 'replicate-vid']);
    root.unmount();
  });
});
