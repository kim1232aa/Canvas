import { ensureModelSchema, modelSchemaVersion, subscribeModelSchema, withCachedSchemaProperties } from '../services/modelSchemaCache';
import { canvasLorasForCheckpoint } from '../utils/canvasLoras';
import { hasReferenceImageInput } from '../utils/graphEngine';
import { overlapPushes } from '../utils/nodeOverlap';
import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  CanvasMode,
  CanvasTransform,
  Connection,
  DataType,
  DraggingWire,
  NodeInstance,
  SOCKET_COLORS,
  SpatialFrame,
} from '../types/graph';
import { areSocketsCompatible } from '../utils/graphEngine';
import { NodeItem } from './NodeItem';
import { SpatialFrameItem } from './SpatialFrameItem';
import { NODE_DEFINITIONS } from '../constants/nodes';
import { resolveCheckpointForNode } from '../utils/resolveCheckpoint';
import { Plus, X, Trash2, RotateCcw, Sparkles, Settings, LayoutGrid } from 'lucide-react';

interface CanvasProps {
  canvasMode: CanvasMode;
  nodes: NodeInstance[];
  connections: Connection[];
  spatialFrames: SpatialFrame[];
  transform: CanvasTransform;
  selectedNodeId: string | null;
  selectedFrameId: string | null;
  onSelectNode: (id: string | null) => void;
  onSelectFrame: (id: string | null) => void;
  onUpdateTransform: (t: CanvasTransform | ((prev: CanvasTransform) => CanvasTransform)) => void;
  onUpdateNodePos: (id: string, pos: { x: number; y: number }) => void;
  onUpdateNodeValue: (nodeId: string, widgetName: string, value: any) => void;
  onDeleteNode: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onToggleBypass: (id: string) => void;
  onAddConnection: (conn: Omit<Connection, 'id'>) => void;
  onDeleteConnection: (connId: string) => void;
  /** clean-1005: same 底模连线断开 sentence as the Run banner; shown on the LoRA node where the chain breaks. */
  modelChainBreakInfo?: { message: string; atNodeId: string };
  onAddNode: (type: string, pos: { x: number; y: number }) => void;
  onUpdateFramePos: (id: string, pos: { x: number; y: number }) => void;
  onUpdateFrame: (frameId: string, partial: Partial<SpatialFrame>) => void;
  onDeleteFrame: (frameId: string) => void;
  onQueueFrame: (frameId: string) => void;
  onOpenFrameInspector: (frameId: string) => void;
  onBranchVariation: (frame: SpatialFrame) => void;
  onOpenCivitaiPicker: (nodeId: string) => void;
  onPreviewImage: (url: string) => void;
  currentCheckpoint?: string;
  onAutoFixCheckpoint?: (checkpoint: string) => void;
  onOpenModelHub?: (category?: any) => void;
  onClearCanvas?: (type: 'all' | 'nodes' | 'frames' | 'reset-default') => void;
  onOpenWorkflowPresets?: () => void;
  onOpenSettings?: () => void;
  onAddSpatialFrame?: () => void;
}

export const Canvas: React.FC<CanvasProps> = ({
  canvasMode,
  nodes,
  connections,
  spatialFrames,
  transform,
  selectedNodeId,
  selectedFrameId,
  onSelectNode,
  onSelectFrame,
  onUpdateTransform,
  onUpdateNodePos,
  onUpdateNodeValue,
  onDeleteNode,
  onToggleCollapse,
  onToggleBypass,
  onAddConnection,
  onDeleteConnection,
  modelChainBreakInfo,
  onAddNode,
  onUpdateFramePos,
  onUpdateFrame,
  onDeleteFrame,
  onQueueFrame,
  onOpenFrameInspector,
  onBranchVariation,
  onOpenCivitaiPicker,
  onPreviewImage,
  currentCheckpoint,
  onAutoFixCheckpoint,
  onOpenModelHub,
  onClearCanvas,
  onOpenWorkflowPresets,
  onOpenSettings,
  onAddSpatialFrame,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Dragging elements
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [draggingFrameId, setDraggingFrameId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Wire Connection Dragging
  const [draggingWire, setDraggingWire] = useState<DraggingWire | null>(null);
  const wirePressRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const [hoveredWireId, setHoveredWireId] = useState<string | null>(null);

  // Context Menu for Adding Nodes or Frames
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; canvasX: number; canvasY: number } | null>(null);

  // Spacebar tracking for panning
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Convert screen coordinates to canvas graph coordinates
  const screenToCanvas = useCallback(
    (screenX: number, screenY: number) => {
      const rect = containerRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
      return {
        x: (screenX - rect.left - transform.x) / transform.scale,
        y: (screenY - rect.top - transform.y) / transform.scale,
      };
    },
    [transform]
  );

  // Pan Canvas
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || isSpacePressed || (e.target as HTMLElement).id === 'canvas-background') {
      setIsPanning(true);
      setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
      onSelectNode(null);
      onSelectFrame(null);
      setContextMenu(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      onUpdateTransform((prev) => ({
        ...prev,
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      }));
      return;
    }

    if (draggingNodeId) {
      const node = nodes.find((n) => n.id === draggingNodeId);
      if (node) {
        const mouseCanvas = screenToCanvas(e.clientX, e.clientY);
        onUpdateNodePos(draggingNodeId, {
          x: Math.round(mouseCanvas.x - dragOffset.x),
          y: Math.round(mouseCanvas.y - dragOffset.y),
        });
      }
      return;
    }

    if (draggingFrameId) {
      const frame = spatialFrames.find((f) => f.id === draggingFrameId);
      if (frame) {
        const mouseCanvas = screenToCanvas(e.clientX, e.clientY);
        onUpdateFramePos(draggingFrameId, {
          x: Math.round(mouseCanvas.x - dragOffset.x),
          y: Math.round(mouseCanvas.y - dragOffset.y),
        });
      }
      return;
    }

    if (draggingWire) {
      const mouseCanvas = screenToCanvas(e.clientX, e.clientY);
      setDraggingWire((prev) =>
        prev
          ? {
              ...prev,
              currentX: mouseCanvas.x,
              currentY: mouseCanvas.y,
            }
          : null
      );
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
    setDraggingFrameId(null);
    setDraggingWire(null);
  };

  // Zoom centered on cursor
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.08;
    const direction = e.deltaY < 0 ? 1 : -1;
    const newScale = Math.min(Math.max(transform.scale * (direction > 0 ? zoomFactor : 1 / zoomFactor), 0.15), 2.5);

    const rect = containerRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newX = mouseX - ((mouseX - transform.x) * newScale) / transform.scale;
    const newY = mouseY - ((mouseY - transform.y) * newScale) / transform.scale;

    onUpdateTransform({
      x: newX,
      y: newY,
      scale: newScale,
    });
  };

  // Dragging Handlers
  // Re-render when a model Schema arrives so send badges update.
  React.useSyncExternalStore(subscribeModelSchema, modelSchemaVersion);
  // Grown nodes (e.g. LoRA warning box) push nodes below them down instead of covering them.
  const nodesRef = React.useRef(nodes);
  nodesRef.current = nodes;
  const handleMeasuredHeight = React.useCallback((nodeId: string, height: number) => {
    for (const push of overlapPushes(nodesRef.current, nodeId, height)) onUpdateNodePos(push.id, push.pos);
  }, [onUpdateNodePos]);

  const handleStartNodeDrag = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    onSelectNode(nodeId);
    onSelectFrame(null);
    setContextMenu(null);
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const mouseCanvas = screenToCanvas(e.clientX, e.clientY);
    setDraggingNodeId(nodeId);
    setDragOffset({
      x: mouseCanvas.x - node.pos.x,
      y: mouseCanvas.y - node.pos.y,
    });
  };

  const handleStartFrameDrag = (e: React.MouseEvent, frameId: string) => {
    e.stopPropagation();
    onSelectFrame(frameId);
    onSelectNode(null);
    setContextMenu(null);
    const frame = spatialFrames.find((f) => f.id === frameId);
    if (!frame) return;

    const mouseCanvas = screenToCanvas(e.clientX, e.clientY);
    setDraggingFrameId(frameId);
    setDragOffset({
      x: mouseCanvas.x - frame.pos.x,
      y: mouseCanvas.y - frame.pos.y,
    });
  };

  // Socket Connections
  const handleStartConnecting = (
    nodeId: string,
    socketId: string,
    isOutput: boolean,
    type: DataType,
    e: React.MouseEvent
  ) => {
    const mouseCanvas = screenToCanvas(e.clientX, e.clientY);
    setDraggingWire({
      fromNodeId: nodeId,
      fromSocketId: socketId,
      isOutput,
      type,
      startX: mouseCanvas.x,
      startY: mouseCanvas.y,
      currentX: mouseCanvas.x,
      currentY: mouseCanvas.y,
    });
  };

  const handleEndConnecting = (
    targetNodeId: string,
    targetSocketId: string,
    targetIsOutput: boolean,
    targetType: DataType
  ) => {
    if (!draggingWire) return;
    if (draggingWire.fromNodeId === targetNodeId) {
      setDraggingWire(null);
      return;
    }
    if (draggingWire.isOutput === targetIsOutput) {
      setDraggingWire(null);
      return;
    }
    if (!areSocketsCompatible(draggingWire.type, targetType)) {
      setDraggingWire(null);
      return;
    }

    const fromNode = draggingWire.isOutput ? draggingWire.fromNodeId : targetNodeId;
    const fromSocket = draggingWire.isOutput ? draggingWire.fromSocketId : targetSocketId;
    const toNode = draggingWire.isOutput ? targetNodeId : draggingWire.fromNodeId;
    const toSocket = draggingWire.isOutput ? targetSocketId : draggingWire.fromSocketId;

    const exists = connections.some(
      (c) =>
        c.fromNodeId === fromNode &&
        c.fromSocketId === fromSocket &&
        c.toNodeId === toNode &&
        c.toSocketId === toSocket
    );

    if (!exists) {
      onAddConnection({
        fromNodeId: fromNode,
        fromSocketId: fromSocket,
        toNodeId: toNode,
        toSocketId: toSocket,
        type: draggingWire.type,
      });
    }

    setDraggingWire(null);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const mouseCanvas = screenToCanvas(e.clientX, e.clientY);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      canvasX: mouseCanvas.x,
      canvasY: mouseCanvas.y,
    });
  };

  const getSocketCanvasPosition = (nodeId: string, socketId: string, isOutput: boolean) => {
    // 1. Pixel-perfect direct DOM measurement
    const portEl = document.getElementById(isOutput ? `socket-${nodeId}-${socketId}-out` : `socket-${nodeId}-${socketId}-in`);
    if (portEl && containerRef.current) {
      const elRect = portEl.getBoundingClientRect();
      const contRect = containerRef.current.getBoundingClientRect();
      return {
        x: (elRect.left + elRect.width / 2 - contRect.left - transform.x) / transform.scale,
        y: (elRect.top + elRect.height / 2 - contRect.top - transform.y) / transform.scale,
      };
    }

    // 2. High-precision geometric fallback if DOM element not yet mounted
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };

    const width = node.width || 300;
    const nodeX = node.pos.x;
    const nodeY = node.pos.y;

    if (isOutput) {
      const idx = node.outputs.findIndex((s) => s.id === socketId);
      const outputIndex = idx >= 0 ? idx : 0;
      return {
        x: nodeX + width - 15,
        y: nodeY + 54 + outputIndex * 26,
      };
    } else {
      const idx = node.inputs.findIndex((s) => s.id === socketId);
      const inputIndex = idx >= 0 ? idx : 0;
      return {
        x: nodeX + 15,
        y: nodeY + 54 + inputIndex * 26,
      };
    }
  };

  const generateBezierCurve = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = Math.abs(x2 - x1);
    const controlOffset = Math.max(dx * 0.5, 50);
    return `M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`;
  };

  return (
    <div
      ref={containerRef} data-testid="canvas-container"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
      className="relative w-full h-full overflow-hidden bg-[#0c0d11] cursor-default select-none"
    >
      {/* Signature Modern Studio Dot Grid */}
      <div
        id="canvas-background"
        className="absolute inset-0"
        style={{
          backgroundSize: `${28 * transform.scale}px ${28 * transform.scale}px`,
          backgroundImage: `
            radial-gradient(circle, #272a36 ${1.2 * transform.scale}px, transparent ${1.2 * transform.scale}px)
          `,
          backgroundPosition: `${transform.x}px ${transform.y}px`,
        }}
      />

      {/* Main Graph/Spatial Container */}
      <div
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
        }}
        className="absolute inset-0 pointer-events-none"
      >
        {/* SVG Connections Layer (Visible only in Graph mode) */}
        <svg className={`absolute inset-0 w-[50000px] h-[50000px] overflow-visible pointer-events-none transition-opacity duration-300 ${
          canvasMode === 'graph' ? 'opacity-100 z-10' : 'opacity-0 hidden pointer-events-none'
        }`}>
          {connections.map((conn) => {
            const start = getSocketCanvasPosition(conn.fromNodeId, conn.fromSocketId, true);
            const end = getSocketCanvasPosition(conn.toNodeId, conn.toSocketId, false);
            const pathData = generateBezierCurve(start.x, start.y, end.x, end.y);
            const color = SOCKET_COLORS[conn.type] || '#cbd5e1';
            const isHovered = hoveredWireId === conn.id;

            const fromNode = nodes.find((n) => n.id === conn.fromNodeId);
            const isRunning = fromNode?.state === 'running';

            // clean-1005: single click near a freshly linked socket was deleting the edge while the user tried to drag
            // the node to align it (wire hit-area extends outside the node). Delete only on double-click; ignore drag-like presses.
            return (
              <g
                key={conn.id}
                className="pointer-events-auto cursor-pointer group"
                onMouseEnter={() => setHoveredWireId(conn.id)}
                onMouseLeave={() => setHoveredWireId(null)}
                onMouseDown={(e) => { wirePressRef.current = { id: conn.id, x: e.clientX, y: e.clientY }; }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  const p = wirePressRef.current;
                  if (p && p.id === conn.id && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) return;
                  onDeleteConnection(conn.id);
                }}
                onClick={(e) => { e.stopPropagation(); /* single click no longer deletes */ }}
              >
                <path d={pathData} fill="none" stroke="transparent" strokeWidth="18" />
                <title>{isHovered ? '双击删除连线' : ''}</title>
                <path
                  d={pathData}
                  fill="none"
                  stroke={isHovered ? '#ff3366' : color}
                  strokeWidth={isHovered ? 4 : 2.5}
                  strokeOpacity={isHovered ? 1.0 : 0.75}
                />
                {isRunning && (
                  <path
                    d={pathData}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="3.5"
                    strokeDasharray="8,8"
                    className="animate-[dash_1s_linear_infinite]"
                  />
                )}
              </g>
            );
          })}

          {draggingWire && (
            <path
              d={
                draggingWire.isOutput
                  ? generateBezierCurve(
                      draggingWire.startX,
                      draggingWire.startY,
                      draggingWire.currentX,
                      draggingWire.currentY
                    )
                  : generateBezierCurve(
                      draggingWire.currentX,
                      draggingWire.currentY,
                      draggingWire.startX,
                      draggingWire.startY
                    )
              }
              fill="none"
              stroke={SOCKET_COLORS[draggingWire.type] || '#00f0ff'}
              strokeWidth="3.5"
              strokeDasharray="6,4"
              className="animate-[dash_0.6s_linear_infinite]"
            />
          )}
        </svg>

        {/* Spatial Generation Frames Layer */}
        <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${
          canvasMode === 'spatial' ? 'opacity-100 z-20 pointer-events-auto' : 'opacity-0 pointer-events-none hidden z-0'
        }`}>
          {spatialFrames.map((frame) => (
            <div key={frame.id} className="pointer-events-auto">
              <SpatialFrameItem
                frame={frame}
                isSelected={selectedFrameId === frame.id}
                zoom={transform.scale}
                onSelect={(e) => {
                  e.stopPropagation();
                  onSelectFrame(frame.id);
                  onSelectNode(null);
                  setContextMenu(null);
                }}
                onStartDrag={handleStartFrameDrag}
                onUpdateFrame={onUpdateFrame}
                onDeleteFrame={onDeleteFrame}
                onQueueFrame={onQueueFrame}
                onOpenInspector={onOpenFrameInspector}
                onPreviewImage={onPreviewImage}
                onBranchVariation={onBranchVariation}
              />
            </div>
          ))}
        </div>

        {/* ComfyUI Nodes Layer */}
        <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${
          canvasMode === 'graph' ? 'opacity-100 z-20 pointer-events-auto' : 'opacity-0 pointer-events-none hidden z-0'
        }`}>
          {nodes.map((node) => (
            <div key={node.id} className="pointer-events-auto">
              <NodeItem
                node={node}
                isSelected={selectedNodeId === node.id}
                zoom={transform.scale}
                onSelect={(e) => {
                  e.stopPropagation();
                  onSelectNode(node.id);
                  onSelectFrame(null);
                  setContextMenu(null);
                }}
                onStartDrag={handleStartNodeDrag}
                onUpdateValue={onUpdateNodeValue}
                onDeleteNode={onDeleteNode}
                onToggleCollapse={onToggleCollapse}
                onToggleBypass={onToggleBypass}
                onStartConnecting={handleStartConnecting}
                onEndConnecting={handleEndConnecting}
                onOpenCivitaiPicker={onOpenCivitaiPicker}
                onImageClick={onPreviewImage}
                currentCheckpoint={
                  (node.type === 'LoRALoader' || node.type === 'LoraLoader' || node.type === 'LoraLoaderModelOnly' || node.type === 'CivitaiLoRABrowserNode'
                    || node.type === 'KSampler' || node.type === 'EmptyLatentImage'
                    || node.type === 'CLIPTextEncode' || node.type === 'CLIPTextEncodeNegative')
                    ? (resolveCheckpointForNode(node.id, nodes, connections).checkpoint || currentCheckpoint)
                    : currentCheckpoint
                }
                currentProvider={
                  (node.type === 'LoRALoader' || node.type === 'LoraLoader' || node.type === 'LoraLoaderModelOnly' || node.type === 'CivitaiLoRABrowserNode'
                    || node.type === 'KSampler' || node.type === 'EmptyLatentImage'
                    || node.type === 'CLIPTextEncode' || node.type === 'CLIPTextEncodeNegative')
                    ? (resolveCheckpointForNode(node.id, nodes, connections).provider || undefined)
                    : undefined
                }
                modelChainBreakMessage={modelChainBreakInfo?.atNodeId === node.id ? modelChainBreakInfo.message : undefined}
                onMeasuredHeight={handleMeasuredHeight}
                schemaCustomParameters={(() => {
                  // Model Schema field list lives on the engine/Checkpoint node; KSampler etc. read it for send badges.
                  const engineId = resolveCheckpointForNode(node.id, nodes, connections).engineNodeId;
                  const engine = engineId ? nodes.find((n) => n.id === engineId) : undefined;
                  if (!engine) return undefined;
                  const r = resolveCheckpointForNode(node.id, nodes, connections);
                  ensureModelSchema(r.provider, r.checkpoint);
                  const cp = withCachedSchemaProperties(r.provider, r.checkpoint, engine.values?.custom_parameters);
                  // Same reference-image rule the run extraction uses; drives the denoise badge via planCanvasField.
                  try {
                    const o = JSON.parse(cp || '{}') || {};
                    o._canvas = { ...(o._canvas || {}), hasReferenceImage: hasReferenceImageInput(nodes as any, connections as any, node.id) };
                    return JSON.stringify(o);
                  } catch { return cp; }
                })()}
                canvasLoras={node.type === 'CheckpointLoaderSimple' ? canvasLorasForCheckpoint(node.id, nodes as any, connections as any) : undefined}
                onAutoFixCheckpoint={onAutoFixCheckpoint}
                onOpenModelHub={onOpenModelHub}
                onOpenSettings={onOpenSettings}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Empty State Onboarding: Graph Mode */}
      {canvasMode === 'graph' && nodes.length === 0 && (
        <div
          data-testid="canvas-empty-onboarding"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 w-full max-w-xl p-6 bg-[#161720]/95 backdrop-blur-xl border border-[#2b2d39] rounded-2xl shadow-2xl space-y-5 text-slate-200 pointer-events-auto"
        >
          <div className="flex items-center gap-3 border-b border-[#252733] pb-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 text-cyan-400 border border-cyan-500/30">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                从零开启创作 · 新手入门引导
                <span className="text-[10px] font-mono font-normal px-2 py-0.5 rounded-full bg-cyan-950/60 text-cyan-300 border border-cyan-500/30">
                  空白画布
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                当前画布为空。您可以一键载入标准工作流，或通过以下 6 步自由搭建：
              </p>
            </div>
          </div>

          {/* 6-step creation flow */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-[#111216] border border-[#232530] space-y-1">
              <div className="font-semibold text-cyan-300 flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] flex items-center justify-center font-bold">1</span>
                选择服务商
              </div>
              <p className="text-[11px] text-slate-400 leading-tight">
                如 WaveSpeed、Fal.ai、Together、Venice 等云端推理服务
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-[#111216] border border-[#232530] space-y-1">
              <div className="font-semibold text-cyan-300 flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] flex items-center justify-center font-bold">2</span>
                选择基础模型
              </div>
              <p className="text-[11px] text-slate-400 leading-tight">
                支持 Z-Image Turbo、Krea 2、MOSS-Image、Wan 2.2 等文生图/文生视频大模型
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-[#111216] border border-[#232530] space-y-1">
              <div className="font-semibold text-indigo-300 flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] flex items-center justify-center font-bold">3</span>
                输入提示词
              </div>
              <p className="text-[11px] text-slate-400 leading-tight">
                正向提示词描述画面细节与光影，负向提示词过滤瑕疵
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-[#111216] border border-[#232530] space-y-1">
              <div className="font-semibold text-indigo-300 flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] flex items-center justify-center font-bold">4</span>
                可选挂载 LoRA
              </div>
              <p className="text-[11px] text-slate-400 leading-tight">
                调节艺术风格、二次元画风或特定写实人物特征
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-[#111216] border border-[#232530] space-y-1">
              <div className="font-semibold text-purple-300 flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-purple-500/20 text-purple-300 text-[10px] flex items-center justify-center font-bold">5</span>
                点击右上角「运行」
              </div>
              <p className="text-[11px] text-slate-400 leading-tight">
                快捷键 Ctrl / Cmd + Enter 实时调度真实云端推理
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-[#111216] border border-[#232530] space-y-1">
              <div className="font-semibold text-purple-300 flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-purple-500/20 text-purple-300 text-[10px] flex items-center justify-center font-bold">6</span>
                实时查看产物
              </div>
              <p className="text-[11px] text-slate-400 leading-tight">
                图像实时上屏，自动保存至历史记录并支持导出与复用
              </p>
            </div>
          </div>

          {/* Quick Action CTAs */}
          <div className="pt-2 flex flex-wrap items-center gap-2 border-t border-[#252733]">
            {onClearCanvas && (
              <button
                type="button"
                onClick={() => onClearCanvas('reset-default')}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-cyan-600/20 transition-all cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>一键加载标准文生图工作流</span>
              </button>
            )}

            {onOpenWorkflowPresets && (
              <button
                type="button"
                onClick={onOpenWorkflowPresets}
                className="px-3 py-2 rounded-xl bg-[#20222c] hover:bg-[#282a37] text-slate-200 hover:text-white font-semibold text-xs border border-[#303342] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>浏览预设模板库</span>
              </button>
            )}

            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="px-3 py-2 rounded-xl bg-[#20222c] hover:bg-[#282a37] text-slate-200 hover:text-white font-semibold text-xs border border-[#303342] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-cyan-400" />
                <span>配置 API 密钥</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Empty State Onboarding: Spatial Mode */}
      {canvasMode === 'spatial' && spatialFrames.length === 0 && (
        <div
          data-testid="spatial-empty-onboarding"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 w-full max-w-md p-6 bg-[#161720]/95 backdrop-blur-xl border border-[#2b2d39] rounded-2xl shadow-2xl text-center space-y-4 text-slate-200 pointer-events-auto"
        >
          <div className="w-12 h-12 mx-auto rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center">
            <LayoutGrid className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">画板视图当前为空</h3>
            <p className="text-xs text-slate-400 mt-1">
              画板模式用于多选区空间构图与局部生成。请添加第一块选区画板：
            </p>
          </div>
          {onAddSpatialFrame && (
            <button
              type="button"
              onClick={onAddSpatialFrame}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center gap-1.5 mx-auto shadow-lg shadow-cyan-600/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ 新建画板选区</span>
            </button>
          )}
        </div>
      )}

      {/* Right-click Context Menu */}
      {contextMenu && (
        <div
          style={{ left: contextMenu.x, top: contextMenu.y }}
          className="fixed z-50 bg-[#16171e]/98 border border-[#2b2d39] rounded-xl shadow-2xl p-2 w-64 text-xs space-y-1 backdrop-blur-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-[#232530] flex items-center justify-between">
            <span>添加至无限画布</span>
            <button
              onClick={() => setContextMenu(null)}
              className="text-slate-500 hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto space-y-1 pt-1">
            {Object.values(NODE_DEFINITIONS).map((def) => (
              <button
                key={def.type}
                onClick={() => {
                  onAddNode(def.type, {
                    x: Math.round(contextMenu.canvasX),
                    y: Math.round(contextMenu.canvasY),
                  });
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#232530] text-slate-200 transition-colors flex items-center justify-between group"
              >
                <div>
                  <div className="font-semibold text-white group-hover:text-cyan-400">{def.title}</div>
                  <div className="text-[10px] text-slate-400 truncate max-w-[190px]">{def.description}</div>
                </div>
                <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400" />
              </button>
            ))}
          </div>

          {onClearCanvas && (
            <div className="pt-2 border-t border-[#232530] space-y-1">
              <button
                onClick={() => {
                  if (confirm('确定一键清空全部画布内容吗？')) {
                    onClearCanvas('all');
                    setContextMenu(null);
                  }
                }}
                className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-rose-950/40 text-rose-300 transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span className="font-semibold">一键清空画布</span>
                </div>
                <span className="text-[9px] font-mono text-rose-400">Clear All</span>
              </button>

              <button
                onClick={() => {
                  if (confirm('确定恢复标准默认工作流吗？')) {
                    onClearCanvas('reset-default');
                    setContextMenu(null);
                  }
                }}
                className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-cyan-950/40 text-cyan-300 transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="font-semibold">重置为默认工作流</span>
                </div>
                <span className="text-[9px] font-mono text-cyan-400">Default</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
