/**
 * Fit View — map all node/frame bounds into the canvas container's visible box.
 * Uses the container's client size (not window), so top-bar chrome and any document scroll do not
 * pull nodes off-screen. Does not clear page scroll; one click is enough.
 * clean-1358 #1: never clamp scale so high that content leaves the usable box; graph mode must not
 * include leftover spatial frames in the bbox (and vice versa). Nodes are never moved.
 * clean-1613 #1: after model switch / taller nodes, Fit must still leave every node inside the
 * usable box (chrome insets). Minimap yellow box must not be clamped into a lie. Left/right chrome
 * (exec log panel, minimap) count as insets too.
 * clean-1651: collapsed exec-log toggle is bottom chrome (rectangle band), not full-column left.
 */
export type FitViewRect = { x: number; y: number; w: number; h: number };
export type FitViewTransform = { x: number; y: number; scale: number };

export type FitViewInsets = { top: number; bottom: number; left: number; right: number };

/** Drop non-finite / non-positive boxes so one bad node cannot NaN the whole fit. */
export function sanitizeFitItems(items: FitViewRect[]): FitViewRect[] {
  return items.filter((it) =>
    Number.isFinite(it.x) && Number.isFinite(it.y) &&
    Number.isFinite(it.w) && Number.isFinite(it.h) &&
    it.w > 0 && it.h > 0
  );
}

/**
 * Usable box = container minus floating chrome (top bar / bottom dock / side panels + margins).
 * Only the viewport transform changes; node positions are never moved.
 */
export function computeFitTransform(
  items: FitViewRect[],
  viewport: { width: number; height: number },
  opts: { padding?: number; minScale?: number; maxScale?: number; insets?: Partial<FitViewInsets> } = {},
): FitViewTransform {
  const clean = sanitizeFitItems(items);
  const ins = { top: 0, bottom: 0, left: 0, right: 0, ...(opts.insets || {}) };
  const usable = {
    width: Math.max(1, viewport.width - ins.left - ins.right),
    height: Math.max(1, viewport.height - ins.top - ins.bottom),
  };
  // clean-1358: default minScale 0.05 so a wide/tall graph can still fit.
  // clean-1613: if the first pass still leaves anything outside the usable box, keep lowering the floor.
  const maxScale = opts.maxScale ?? 1.0;
  let minScale = opts.minScale ?? 0.05;
  if (!clean.length || viewport.width <= 0 || viewport.height <= 0) {
    return { x: 80, y: 80, scale: 0.8 };
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    const raw = computeFitTransformRaw(clean, usable, { ...opts, minScale, maxScale });
    const t = { x: raw.x + ins.left, y: raw.y + ins.top, scale: raw.scale };
    if (allItemsInUsableBox(clean, t, viewport, ins, 2)) return t;
    minScale = Math.max(0.01, minScale * 0.5);
  }
  const raw = computeFitTransformRaw(clean, usable, { ...opts, minScale: 0.01, maxScale });
  return { x: raw.x + ins.left, y: raw.y + ins.top, scale: raw.scale };
}

function computeFitTransformRaw(
  items: FitViewRect[],
  viewport: { width: number; height: number },
  opts: { padding?: number; minScale?: number; maxScale?: number } = {},
): FitViewTransform {
  const padding = opts.padding ?? 40;
  const minScale = opts.minScale ?? 0.05;
  const maxScale = opts.maxScale ?? 1.0;
  if (!items.length || viewport.width <= 0 || viewport.height <= 0) {
    return { x: 80, y: 80, scale: 0.8 };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const item of items) {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + item.w);
    maxY = Math.max(maxY, item.y + item.h);
  }
  const graphWidth = maxX - minX + padding * 2;
  const graphHeight = maxY - minY + padding * 2;
  const scale = Math.min(Math.max(Math.min(viewport.width / graphWidth, viewport.height / graphHeight), minScale), maxScale);
  const x = viewport.width / 2 - ((minX + maxX) / 2) * scale;
  const y = viewport.height / 2 - ((minY + maxY) / 2) * scale;
  return { x, y, scale };
}

/** After fit, every item's screen box (in container coords) lies inside [0,width]×[0,height] (with optional slack). */
export function allItemsInViewport(
  items: FitViewRect[],
  transform: FitViewTransform,
  viewport: { width: number; height: number },
  slack = 1,
): boolean {
  return allItemsInUsableBox(items, transform, viewport, { top: 0, bottom: 0, left: 0, right: 0 }, slack);
}

/** Same check against the usable box (container minus chrome insets). */
export function allItemsInUsableBox(
  items: FitViewRect[],
  transform: FitViewTransform,
  viewport: { width: number; height: number },
  insets: Partial<FitViewInsets> = {},
  slack = 1,
): boolean {
  const top = insets.top ?? 0;
  const bottom = viewport.height - (insets.bottom ?? 0);
  const left = insets.left ?? 0;
  const right = viewport.width - (insets.right ?? 0);
  return items.every((item) => {
    const l = item.x * transform.scale + transform.x;
    const t = item.y * transform.scale + transform.y;
    const r = (item.x + item.w) * transform.scale + transform.x;
    const b = (item.y + item.h) * transform.scale + transform.y;
    return l >= left - slack && t >= top - slack && r <= right + slack && b <= bottom + slack;
  });
}

/** Collect fit items for the active mode. Graph ignores leftover spatial frames; spatial uses frames (and nodes if any). */
export function fitItemsForMode(
  mode: 'graph' | 'spatial',
  nodes: Array<{ id: string; pos: { x: number; y: number }; width?: number }>,
  frames: Array<{ pos: { x: number; y: number }; width: number; height: number }>,
  measureHeight?: (nodeId: string) => number | undefined,
  measureWidth?: (nodeId: string) => number | undefined,
): FitViewRect[] {
  if (mode === 'spatial') {
    const frameItems = frames.map((f) => ({ x: f.pos.x, y: f.pos.y, w: f.width, h: f.height + 150 }));
    if (frameItems.length) return sanitizeFitItems(frameItems);
  }
  return sanitizeFitItems(nodes.map((n) => ({
    x: n.pos.x,
    y: n.pos.y,
    w: measureWidth?.(n.id) || n.width || 300,
    h: measureHeight?.(n.id) || 350,
  })));
}

/**
 * Insets of floating chrome over the container (DOM):
 * top = lowest bottom edge of top chrome; bottom = space above bottom chrome;
 * left/right = side panels (exec log, minimap).
 */
export function measureChromeInsets(container: Element | null, margin = 12): FitViewInsets {
  const out: FitViewInsets = { top: 0, bottom: 0, left: 0, right: 0 };
  if (!container || typeof document === 'undefined') return out;
  const c = container.getBoundingClientRect();
  document.querySelectorAll('[data-canvas-chrome="top"]').forEach((el) => {
    const r = el.getBoundingClientRect();
    // +8: keep node titles (first ~24px of card) fully below sticky top bar
    if (r.height > 0) out.top = Math.max(out.top, r.bottom - c.top + margin + 8);
  });
  // fix11.2: only chrome whose box sits in the bottom band counts. Collapsed exec-log is also
  // tagged bottom even when parked under the top bar (fix11.1); counting it would inflate
  // bottom inset to nearly the full viewport and leave Fit with no usable height.
  document.querySelectorAll('[data-canvas-chrome="bottom"]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.height <= 0) return;
    if (r.bottom < c.bottom - Math.min(160, c.height * 0.25)) return;
    out.bottom = Math.max(out.bottom, c.bottom - r.top + margin);
  });
  document.querySelectorAll('[data-canvas-chrome="left"]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0) out.left = Math.max(out.left, r.right - c.left + margin);
  });
  document.querySelectorAll('[data-canvas-chrome="right"]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0) out.right = Math.max(out.right, c.right - r.left + margin);
  });
  // clean-1651: open exec-log panel is full-column left chrome; collapsed toggle is
  // marked bottom (not left) so Fit keeps full width and only clears the bottom band.
  const panel = document.querySelector('[data-testid="exec-log-panel"]') as HTMLElement | null;
  if (panel) {
    const r = panel.getBoundingClientRect();
    if (r.width > 0) out.left = Math.max(out.left, r.right - c.left + margin);
  }
  return out;
}
