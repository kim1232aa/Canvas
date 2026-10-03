import { useEffect, useRef } from 'react';
import type { CanvasMode } from './types/graph';

type Summary = {canvasMode: CanvasMode; nodeCount: number; connectionCount: number; frameCount: number};
type ModelContext = {registerTool: (tool: any, options: {signal: AbortSignal}) => void | Promise<void>};

export function useCanvasTools(summary: Summary, setMode: (mode: CanvasMode) => void) {
  const current = useRef(summary);
  current.current = summary;
  useEffect(() => {
    const context = (document as Document & {modelContext?: ModelContext}).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: any) => {
      try {Promise.resolve(context.registerTool(tool, {signal: lifecycle.signal})).catch(error => console.warn('Canvas tool registration failed', error));}
      catch (error) {console.warn('Canvas tool registration failed', error);}
    };
    register({name: 'read_canvas_summary', title: '读取画布概况', description: 'Read the current canvas view and counts without changing the canvas.', inputSchema: {type: 'object', properties: {}, additionalProperties: false}, annotations: {readOnlyHint: true}, execute(input: unknown) {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Expected an empty object');
      return {...current.current};
    }});
    register({name: 'set_canvas_view', title: '切换画布视图', description: 'Switch the visible canvas between the node workflow and spatial board without generating media.', inputSchema: {type: 'object', properties: {mode: {type: 'string', enum: ['graph', 'spatial']}}, required: ['mode'], additionalProperties: false}, annotations: {readOnlyHint: false}, async execute(input: unknown) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('mode is required');
      const value = input as Record<string, unknown>;
      if (Object.keys(value).length !== 1 || !['graph', 'spatial'].includes(String(value.mode))) throw new Error('mode must be graph or spatial');
      setMode(value.mode as CanvasMode);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {...current.current};
    }});
    return () => lifecycle.abort();
  }, [setMode]);
}
