// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { getSpatialFrameLoraBanner } from '../utils/spatialFrameLoraBanner';
import { validateModelCompatibility } from '../utils/baseModelMatcher';
import { isLoraUnsupportedOnEndpoint, LORA_UNSUPPORTED_TITLE, LORA_UNSUPPORTED_EMPTY_CHECKPOINT, LORA_UNSUPPORTED_MESSAGE } from '../utils/resolveCheckpoint';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SpatialFrameItem} from './SpatialFrameItem';
import type {SpatialFrame} from '../types/graph';

function renderLoraFrame(checkpoint:string,baseModel?:string,status:SpatialFrame['status']='idle') {
  const noop=()=>{};
  const lora={name:'adapter.safetensors',baseModel,modelStrength:0.8,clipStrength:0.8,triggerWords:''};
  const frame:SpatialFrame={id:'frame',title:'Image',pos:{x:0,y:0},width:360,height:360,prompt:'library',negativePrompt:'',status,createdAt:0,
    params:{targetProvider:'civitai',checkpoint,width:1024,height:768,denoise:1,batchSize:1,seedControl:'fixed',loras:[lora]}};
  return renderToStaticMarkup(React.createElement(SpatialFrameItem,{frame,isSelected:false,zoom:1,onSelect:noop,onStartDrag:noop,onUpdateFrame:noop,onDeleteFrame:noop,onQueueFrame:noop,onOpenInspector:noop,onPreviewImage:noop,onBranchVariation:noop}));
}

function findButtonByText(html:string,label:string) {
  const document = new DOMParser().parseFromString(html,'text/html');
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes(label));
}

it.each([['custom-checkpoint',undefined],['flux-dev','Flux.1 D'],['custom-model','custom-model']])('renders unverified LoRA neutrally for %s without claiming compatibility',(checkpoint,baseModel)=>{
  const html=renderLoraFrame(checkpoint,baseModel);
  const compat=validateModelCompatibility(checkpoint,baseModel,'adapter.safetensors','civitai');
  expect(html).toContain(`title="${compat.message}"`);
  expect(html).not.toContain('待验证');
  expect(html).not.toContain('与当前底模架构兼容');
  expect(html).not.toContain('已兼容');
  expect(html).not.toContain('bg-purple-950/50 text-purple-300 border border-purple-800/40');
  expect(html).not.toContain('bg-rose-950/60 text-rose-300 border border-rose-700/50');
  expect(findButtonByText(html,'生成此选区画板')?.disabled).toBe(false);
  expect(findButtonByText(renderLoraFrame(checkpoint,baseModel,'generating'),'图像渲染中')?.disabled).toBe(true);
});

// 2026-10-15: family-name guess is not real metadata → no red 「底模架构不匹配」 (warning removed, not blocked).
it('does not render a guessed architecture mismatch (name-substring families are unreliable)',()=>{
  const html=renderLoraFrame('Tongyi-MAI/Z-Image-Turbo','Flux.1 D');
  expect(html).not.toContain('底模架构不匹配');
  expect(html).not.toContain('bg-rose-950/60 text-rose-300 border border-rose-700/50');
  expect(html).not.toContain('待验证');
});

const fluxLora = {
  name: '[Flux1] Asian Mix Lora - Krea/Dev.safetensors',
  baseModel: 'Flux.1 D',
  modelStrength: 0.8,
};

describe('SpatialFrameItem LoRA visible copy (same sentences as node/inspector)', () => {
  it('ModelScope Z-Image + Flux LoRA: no guessed mismatch banner', () => {
    const banner = getSpatialFrameLoraBanner('modelscope_ai', 'Tongyi-MAI/Z-Image-Turbo', [fluxLora]);
    expect(banner).toBeNull();
    const compat = validateModelCompatibility('Tongyi-MAI/Z-Image-Turbo', fluxLora.baseModel, fluxLora.name, 'modelscope_ai');
    expect(compat.verification).toBe('unverified');
    expect(compat.message).not.toMatch(/底模架构不匹配/);
  });

  it('returns null when no loras', () => {
    expect(getSpatialFrameLoraBanner('fal', '', [])).toBeNull();
  });
});
