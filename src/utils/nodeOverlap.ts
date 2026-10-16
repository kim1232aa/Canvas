/**
 * When a node's rendered height grows (e.g. LoRA warning box appears), nodes whose top edge now
 * falls inside it are moved down to sit below it. Visible position change only — no content is hidden.
 */
export interface LayoutNode { id: string; pos: { x: number; y: number }; width?: number }

export const NODE_STACK_GAP = 16;
/** Nodes starting within the header band are side-by-side, not "below" — leave them alone. */
const HEADER_BAND = 40;

export function overlapPushes(
  nodes: LayoutNode[],
  grownId: string,
  measuredHeight: number,
  gap = NODE_STACK_GAP,
): Array<{ id: string; pos: { x: number; y: number } }> {
  const grown = nodes.find((n) => n.id === grownId);
  if (!grown || !(measuredHeight > 0)) return [];
  const left = grown.pos.x;
  const right = grown.pos.x + (grown.width || 300);
  const bottom = grown.pos.y + measuredHeight + gap;
  return nodes
    .filter((n) => n.id !== grownId)
    .filter((n) => n.pos.x < right && n.pos.x + (n.width || 300) > left)
    .filter((n) => n.pos.y > grown.pos.y + HEADER_BAND && n.pos.y < bottom)
    .map((n) => ({ id: n.id, pos: { x: n.pos.x, y: bottom } }));
}

/** Place a new node so its box does not overlap existing nodes (only the new position is adjusted). */
export function findNonOverlappingPos(
  existing: LayoutNode[],
  desired: { x: number; y: number },
  size: { w: number; h: number } = { w: 320, h: 180 },
  gap = NODE_STACK_GAP,
): { x: number; y: number } {
  let { x, y } = desired;
  const overlaps = (nx: number, ny: number) => existing.some((n) => {
    const nw = n.width || 300; const nh = 160;
    return nx < n.pos.x + nw + gap && nx + size.w + gap > n.pos.x && ny < n.pos.y + nh + gap && ny + size.h + gap > n.pos.y;
  });
  let guard = 0;
  while (overlaps(x, y) && guard++ < 40) y += size.h + gap;
  return { x, y };
}
