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
  projects = projects.map(migrateTensorWorkflow).map(resetRunState);
  const active = projects.find(p => p.id === currentId) || projects[0];
  return {projects, active, mode};
}

/**
 * A new page session starts clean: run state from the previous page (error / running / upstreamFailed / progress /
 * error text) is not carried over. Content (values, outputs, images) stays. Errors re-appear only when they happen again.
 */
export function resetRunState(project: CanvasProject): CanvasProject {
  return {
    ...project,
    nodes: (project.nodes || []).map((n: any) => {
      const { errorMessage: _e, errorAt: _ea, upstreamFailed: _u, upstreamLocalBlocked: _l, localBlockReason: _lr, localBlockTitle: _lt, executionProgress: _p, ...rest } = n || {};
      // Schema-derived data cached in custom_parameters is per page session: badges/Schema fields must wait for a user action.
      const values = rest.values ? { ...rest.values, ...(typeof rest.values.custom_parameters === 'string' ? { custom_parameters: stripDerivedSchema(rest.values.custom_parameters) } : {}) } : rest.values;
      // Outputs are kept (user data) but flagged as from before the refresh, with their original time when known.
      const hasOutput = !!rest.outputData;
      const restored = hasOutput && rest.restoredFromPreviousSession === undefined ? { restoredFromPreviousSession: { at: rest.outputAt ?? null } } : {};
      return { ...rest, ...(values !== undefined ? { values } : {}), ...restored, ...(n?.state === 'error' || n?.state === 'running' ? { state: 'idle' } : {}) };
    }),
    spatialFrames: (project.spatialFrames || []).map((f: any) => {
      const { errorMessage: _e, executionProgress: _p, executionStage: _s, ...rest } = f || {};
      return { ...rest, ...(f?.status === 'error' || f?.status === 'generating' ? { status: 'idle' } : {}) };
    }),
  } as CanvasProject;
}

/** Drops Schema-derived keys (schemaProperties / schemaConfirmedFields / schemaUnprobed / schemaUnavailable) from _canvas; user JSON and flags stay. */
export function stripDerivedSchema(cp: string): string {
  try {
    const o = JSON.parse(cp);
    if (!o || typeof o !== 'object' || !o._canvas) return cp;
    const { schemaProperties: _a, schemaConfirmedFields: _b, schemaUnprobed: _c, schemaUnavailable: _d, schemaLoading: _f, hasReferenceImage: _g, ...canvas } = o._canvas;
    if (Object.keys(canvas).length === Object.keys(o._canvas).length) return cp;
    return JSON.stringify({ ...o, _canvas: canvas }, null, 2);
  } catch { return cp; }
}
