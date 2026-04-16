import type { AnalysisNode } from "../types/analysisTypes";
import type { SourceEditorState } from "./sourceEditorReducer";

export function selectSelectedNode(
  state: SourceEditorState
): AnalysisNode | null {
  if (!state.selectedNodeId) return null;
  return state.document.nodes.find((node) => node.id === state.selectedNodeId) ?? null;
}

export function selectCurrentFen(state: SourceEditorState): string {
  const selectedNode = selectSelectedNode(state);
  return selectedNode?.fenAfter || state.document.initialFen || "";
}