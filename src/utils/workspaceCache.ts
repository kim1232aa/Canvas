import {migrateTensorWorkflow} from './legacyTensorWorkflow';
import type {CanvasProject} from '../components/CanvasManagerModal';
import type {CanvasMode} from '../types/graph';

export const BOARDS_KEY = 'comfycanvas_boards_v2';
export const ACTIVE_BOARD_KEY = 'comfycanvas_active_board_v2';
export const MODE_KEY = 'comfycanvas_mode_v2';
const INLINE_MEDIA = /^data:(?:image|video|audio)\/[\w.+-]+;base64,/;

/** Copy of a board value with every inline media payload removed; the live state is never changed. */
export function stripInlineMedia<T>(value: T): T {
  if (typeof value === 'string') return (INLINE_MEDIA.test(value) ? '' : value) as T;
  if (Array.isArray(value)) return value.map(stripInlineMedia) as T;
  if (value && typeof value === 'object') {
    const result: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'string' && INLINE_MEDIA.test(item) && key !== 'image_url' && key !== 'referenceImageUrl') continue;
      result[key] = stripInlineMedia(item);
    }
    return result as T;
  }
  return value;
}

export function saveWorkspaceCache(projects: CanvasProject[], activeId: string, mode: CanvasMode, storage: Pick<Storage, 'setItem'> = localStorage) {
  storage.setItem(BOARDS_KEY, JSON.stringify(stripInlineMedia(projects)));
  storage.setItem(ACTIVE_BOARD_KEY, activeId);
  storage.setItem(MODE_KEY, mode);
}

export function isCanvasProject(value: any): value is CanvasProject {
  return value && typeof value.id === 'string' && typeof value.name === 'string' && Array.isArray(value.nodes) && Array.isArray(value.connections) && Array.isArray(value.spatialFrames);
}
export function loadWorkspaceCache(fallback: CanvasProject[], storage: Pick<Storage, 'getItem'> = localStorage) {
  let projects = fallback;
  let currentId: string | null = null;
  let mode: CanvasMode = 'graph';
  try {
    const saved = JSON.parse(storage.getItem(BOARDS_KEY) || 'null');
    if (Array.isArray(saved) && saved.length && saved.every(isCanvasProject)) projects = stripInlineMedia(saved);
    currentId = storage.getItem(ACTIVE_BOARD_KEY);
    mode = storage.getItem(MODE_KEY) === 'spatial' ? 'spatial' : 'graph';
  } catch { /* Keep a usable workspace when an older cache cannot be read. */ }
  projects = projects.map(migrateTensorWorkflow);
  const active = projects.find(p => p.id === currentId) || projects[0];
  return {projects, active, mode};
}
