import React from 'react';
import { CanvasTransform, NodeInstance, SpatialFrame } from '../types/graph';
import { Map, Eye, EyeOff } from 'lucide-react';

interface MinimapProps {
  nodes: NodeInstance[];
  frames: SpatialFrame[];
  transform: CanvasTransform;
  onUpdateTransform: (t: CanvasTransform | ((prev: CanvasTransform) => CanvasTransform)) => void;
  isOpen: boolean;
  onToggle: () => void;
  /** clean-1613: graph mode ignores leftover spatial frames (same as Fit View). */
  canvasMode?: 'graph' | 'spatial';
}

export const Minimap: React.FC<MinimapProps> = ({
  nodes,
  frames,
  transform,
  onUpdateTransform,
  isOpen,
  onToggle,
  canvasMode = 'graph',
}) => {
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="absolute bottom-6 right-6 z-30 p-2.5 rounded-xl bg-[#16171d]/90 backdrop-blur-md border border-[#2b2d37] text-slate-400 hover:text-white shadow-xl hover:bg-[#20222a] transition-all"
        title="打开小地图 (Minimap)"
      >
        <Map className="w-4 h-4" />
      </button>
    );
  }

  // Calculate world bounding box — clean-1613: match Fit View mode (graph → nodes only).
  const allElements = canvasMode === 'spatial' && frames.length
    ? frames.map((f) => ({ x: f.pos.x, y: f.pos.y, w: f.width, h: f.height + 120, type: 'frame' as const }))
    : [
        ...nodes.map((n) => ({ x: n.pos.x, y: n.pos.y, w: n.width || 300, h: 320, type: 'node' as const })),
        ...(canvasMode === 'spatial' ? frames.map((f) => ({ x: f.pos.x, y: f.pos.y, w: f.width, h: f.height + 120, type: 'frame' as const })) : []),
      ];

  let minX = 0,
    minY = 0,
    maxX = 2000,
    maxY = 1500;

  if (allElements.length > 0) {
    minX = Math.min(...allElements.map((e) => e.x)) - 300;
    minY = Math.min(...allElements.map((e) => e.y)) - 300;
    maxX = Math.max(...allElements.map((e) => e.x + e.w)) + 300;
    maxY = Math.max(...allElements.map((e) => e.y + e.h)) + 300;
  }

  const worldWidth = Math.max(maxX - minX, 1000);
  const worldHeight = Math.max(maxY - minY, 800);

  const mapWidth = 200;
  const mapHeight = 130;

  const scaleX = mapWidth / worldWidth;
  const scaleY = mapHeight / worldHeight;
  const scale = Math.min(scaleX, scaleY);

  // clean-1358 #1: viewport rect must use the canvas container (same box Fit View uses), not window —
  // otherwise the yellow box drifts from the nodes after Fit View.
  const canvasEl = typeof document !== 'undefined' ? (document.querySelector('[data-testid="canvas-container"]') as HTMLElement | null) : null;
  const viewW = canvasEl?.clientWidth || window.innerWidth;
  const viewH = canvasEl?.clientHeight || window.innerHeight;
  const vpWidth = viewW / transform.scale;
  const vpHeight = viewH / transform.scale;
  const vpX = -transform.x / transform.scale;
  const vpY = -transform.y / transform.scale;

  const vpMapX = (vpX - minX) * scale;
  const vpMapY = (vpY - minY) * scale;
  const vpMapW = vpWidth * scale;
  const vpMapH = vpHeight * scale;

  const handleMinimapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const targetWorldX = clickX / scale + minX;
    const targetWorldY = clickY / scale + minY;

    const el = document.querySelector('[data-testid="canvas-container"]') as HTMLElement | null;
    const cw = el?.clientWidth || window.innerWidth;
    const ch = el?.clientHeight || window.innerHeight;
    onUpdateTransform((prev) => ({
      ...prev,
      x: cw / 2 - targetWorldX * prev.scale,
      y: ch / 2 - targetWorldY * prev.scale,
    }));
  };

  return (
    <div data-canvas-chrome="right" className="absolute bottom-6 right-6 z-30 flex flex-col items-end gap-1.5 pointer-events-auto">
      <div className="bg-[#14151a]/95 backdrop-blur-xl border border-[#272932] rounded-xl p-2 shadow-2xl shadow-black/80">
        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pb-1.5 px-1 border-b border-[#22242c]">
          <span>RADAR MINIMAP</span>
          <button
            onClick={onToggle}
            className="hover:text-white p-0.5"
            title="隐藏小地图"
          >
            ✕
          </button>
        </div>

        <div
          onClick={handleMinimapClick}
          style={{ width: mapWidth, height: mapHeight }}
          className="relative bg-[#0d0e12] rounded-lg overflow-hidden border border-[#20222a] mt-1.5 cursor-pointer group"
        >
          {/* Subtle grid in minimap */}
          <div
            className="absolute inset-0 opacity-15"
            style={{
              backgroundImage: 'radial-gradient(circle, #4f566b 1px, transparent 1px)',
              backgroundSize: '12px 12px',
            }}
          />

          {/* Render Elements in Minimap */}
          {allElements.map((el, i) => {
            const elX = (el.x - minX) * scale;
            const elY = (el.y - minY) * scale;
            const elW = Math.max(el.w * scale, 3);
            const elH = Math.max(el.h * scale, 3);

            return (
              <div
                key={i}
                style={{
                  left: elX,
                  top: elY,
                  width: elW,
                  height: elH,
                }}
                className={`absolute rounded-xs ${
                  el.type === 'frame'
                    ? 'bg-cyan-500/60 border border-cyan-400/80'
                    : 'bg-purple-500/60 border border-purple-400/80'
                }`}
              />
            );
          })}

          {/* Viewport Indicator — clean-1613: do NOT clamp into the map; overflow:hidden clips.
              Clamping made the yellow box cover all nodes while the real viewport was empty. */}
          <div
            style={{
              left: vpMapX,
              top: vpMapY,
              width: vpMapW,
              height: vpMapH,
            }}
            className="absolute border-2 border-amber-400/80 bg-amber-400/10 pointer-events-none rounded-xs transition-all duration-75"
          />
        </div>
      </div>
    </div>
  );
};
