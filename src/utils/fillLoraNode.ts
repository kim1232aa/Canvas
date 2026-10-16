import type { NodeInstance } from '../types/graph';

/**
 * 「仅填入当前节点」: the existing LoRA loader node to fill — the node the picker was opened for, else the selected
 * node. Never creates a node; with no current LoRA node it throws so the UI can say so (no silent new node).
 */
export function resolveFillLoraNodeId(nodes: NodeInstance[], pickerTargetId: string | null | undefined, selectedId: string | null | undefined): string {
  const isLora = (id: string | null | undefined) => !!id && nodes.some((n) => n.id === id && n.type === 'LoRALoader');
  if (isLora(pickerTargetId)) return pickerTargetId!;
  if (isLora(selectedId)) return selectedId!;
  throw new Error('当前没有选中 LoRA 节点：「仅填入当前节点」只更新已选中的 LoRA 节点，不会新建节点。请先在画布上选中要填入的 LoRA 节点，或改用「新建节点」。');
}
