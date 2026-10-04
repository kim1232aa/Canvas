import {migrateTensorWorkflow} from './legacyTensorWorkflow';
import type {CanvasProject} from '../components/CanvasManagerModal';
import type {CanvasMode} from '../types/graph';

export const BOARDS_KEY = 'comfycanvas_boards_v2';
export const ACTIVE_BOARD_KEY = 'comfycanvas_active_board_v2';
export const MODE_KEY = 'comfycanvas_mode_v2';
export function isCanvasProject(value: any): value is CanvasProject {
  return value && typeof value.id === 'string' && typeof value.name === 'string' && Array.isArray(value.nodes) && Array.isArray(value.connections) && Array.isArray(value.spatialFrames);
}
export function loadWorkspaceCache(fallback: CanvasProject[], storage: Pick<Storage, 'getItem'> = localStorage) {
  let projects = fallback;
  let currentId: string | null = null;
  let mode: CanvasMode = 'graph';
  try {
    const saved = JSON.parse(storage.getItem(BOARDS_KEY) || 'null');
    if (Array.isArray(saved) && saved.length && saved.every(isCanvasProject)) projects = saved;
    currentId = storage.getItem(ACTIVE_BOARD_KEY);
    mode = storage.getItem(MODE_KEY) === 'spatial' ? 'spatial' : 'graph';
  } catch { /* Keep a usable workspace when an older cache cannot be read. */ }
  projects = projects.map(migrateTensorWorkflow);
  const active = projects.find(p => p.id === currentId) || projects[0];
  return {projects, active, mode};
}
