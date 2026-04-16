import type { CSSProperties, ReactNode } from "react";
import AnalysisBoardCanvas, {
  type AnalysisBoardInteraction,
} from "./AnalysisBoardCanvas";
import type { ArrowSpec, HighlightSpec } from "../types/presentationTypes";
import type {
  SourceBoardMoveEvent,
  SourceBoardMode,
} from "../source-editor/sourceBoardTypes";
import type {
  SetupBrush,
  BoardMoveSubmitEvent,
} from "../source-editor/sourceBoardAdapter";
import { buildMoveResultFromBoardEvent } from "../source-editor/sourceBoardAdapter";

type Props = {
  fen: string;
  mode: SourceBoardMode;
  setupBrush: SetupBrush;
  flipped?: boolean;
  bestMoveNotation?: string | null;
  showBoardFrame?: boolean;
  onMovePlayed: (event: SourceBoardMoveEvent) => void;
  onFenEdited: (fen: string) => void;
  boardInteraction?: AnalysisBoardInteraction;
  layerHighlights?: HighlightSpec[];
  layerArrows?: ArrowSpec[];
  onAnnotateHighlightClick?: (square: number) => void;
  onAnnotateArrowClick?: (square: number) => void;
  moveAnimationSeconds?: number;
  /** Rendered above the board (e.g. move ghost); parent should use `position: absolute` children. */
  boardOverlay?: ReactNode;
};

export default function SourceBoardSurface({
  fen,
  mode,
  setupBrush,
  flipped = false,
  bestMoveNotation,
  showBoardFrame = true,
  onMovePlayed,
  onFenEdited,
  boardInteraction = "play",
  layerHighlights = [],
  layerArrows = [],
  onAnnotateHighlightClick,
  onAnnotateArrowClick,
  moveAnimationSeconds,
  boardOverlay,
}: Props) {
  const handleMovePlayed = (event: BoardMoveSubmitEvent) => {
    onMovePlayed(buildMoveResultFromBoardEvent(event));
  };

  return (
    <div style={rootStyle}>
      <AnalysisBoardCanvas
        fen={fen}
        mode={mode}
        setupBrush={setupBrush}
        flipped={flipped}
        bestMoveNotation={bestMoveNotation}
        showBoardFrame={showBoardFrame}
        onMovePlayed={handleMovePlayed}
        onFenEdited={onFenEdited}
        boardInteraction={boardInteraction}
        layerHighlights={layerHighlights}
        layerArrows={layerArrows}
        onAnnotateHighlightClick={onAnnotateHighlightClick}
        onAnnotateArrowClick={onAnnotateArrowClick}
        moveAnimationSeconds={moveAnimationSeconds}
        externalBoardOverlay={boardOverlay}
      />
    </div>
  );
}

const rootStyle: CSSProperties = {
  height: "100%",
  minHeight: 0,
  background: "#fff",
};