import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { ExpectedMoveSpec, PlacePiecesExpectedSlot } from "../types/authoring/interactionTypes";
import type { StepMoment } from "../types/authoring/timelineTypes";
import type { LanguageCode } from "../types/i18nTypes";
import { createEmptyBoardState } from "../../features/board/boardTypes";
import { boardStateToFen, fenToBoardState } from "../../features/board/fenUtils";
import { createLocalizedText, readLocalizedText, writeLocalizedText } from "../utils/i18nHelpers";
import { normalizeExpectedPlacement } from "../utils/placementHelpers";
import { resolveNotationToEngineMove } from "../utils/resolveNotationToEngineMove";

type Props = {
  moment: StepMoment;
  language: LanguageCode;
  onApply: (next: StepMoment) => void;
  /** FEN of the board the author paints in the studio (step or branch start). */
  editorSourceFen: string;
  /** Live board FEN from the current studio board state. */
  currentBoardFen?: string;
  /** Legacy comfort hooks kept for compatibility; editor now uses simple FEN flow. */
  hasPlacementClip?: boolean;
  onCopyPlacement?: () => void;
  onPastePlacement?: () => void;
  onLoadTargetIntoPreview?: () => void;
  onUsePreviewBoardAsTarget?: () => void;
};

function notationToExpectedMove(token: string): ExpectedMoveSpec | null {
  const clean = token.trim();
  if (!/^\d+(?:[-x]\d+)+$/.test(clean)) return null;
  const isCapture = clean.includes("x");
  const parts = clean
    .split(/[-x]/)
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isFinite(n));
  if (parts.length < 2) return null;
  return {
    from: parts[0]!,
    to: parts[parts.length - 1]!,
    path: parts.length > 2 ? parts : undefined,
    captures: isCapture ? [] : undefined,
  };
}


export default function AuthoringPlacePiecesMomentFields({
  moment,
  language,
  onApply,
  editorSourceFen,
  currentBoardFen,
}: Props) {
  if (moment.type !== "placePieces" || moment.interaction?.kind !== "placePieces") {
    return null;
  }

  const ix = moment.interaction;
  const t = (en: string, nl: string) => (language === "nl" ? nl : en);
  const [sequenceDraft, setSequenceDraft] = useState("");
  const [sequenceInfo, setSequenceInfo] = useState("");
  const [targetFenDraft, setTargetFenDraft] = useState(ix.targetFen ?? "");
  const sequenceFromInteraction = (ix.solutionSequence ?? [])
    .map((mv) => {
      const isCapture = (mv.captures?.length ?? 0) > 0;
      const sep = isCapture ? "x" : "-";
      const path = mv.path && mv.path.length >= 2 ? mv.path : [mv.from, mv.to];
      return path.join(sep);
    })
    .join(" ");
  useEffect(() => {
    setTargetFenDraft(ix.targetFen ?? "");
  }, [ix.targetFen, moment.id]);
  useEffect(() => {
    setSequenceDraft(sequenceFromInteraction);
  }, [sequenceFromInteraction, moment.id]);

  const patchIx = (partial: Partial<typeof ix>) => {
    onApply({
      ...moment,
      interaction: { ...ix, ...partial },
    });
  };

  const liveFen = (currentBoardFen ?? "").trim();
  const fallbackFen = editorSourceFen.trim();
  const boardFenForCapture = liveFen || fallbackFen;

  const handleUseBoardAsStart = () => {
    const fen = boardFenForCapture;
    if (!fen) return;
    onApply({
      ...moment,
      positionRef: { type: "fen", fen },
    });
  };

  const handleGenerateTargetFromSequence = () => {
    const startFen =
      (moment.positionRef?.type === "fen" ? moment.positionRef.fen : boardFenForCapture).trim();
    if (!startFen) {
      setSequenceInfo(t("No start position available.", "Geen startpositie beschikbaar."));
      return;
    }
    let board;
    try {
      board = fenToBoardState(startFen);
    } catch {
      setSequenceInfo(t("Start FEN is invalid.", "Start-FEN is ongeldig."));
      return;
    }
    const tokens = sequenceDraft
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (tokens.length === 0) {
      setSequenceInfo(t("Enter a move sequence first.", "Voer eerst een zettenreeks in."));
      return;
    }
    let applied = 0;
    const parsedSequence: ExpectedMoveSpec[] = [];
    for (const tok of tokens) {
      const parsed = notationToExpectedMove(tok);
      if (parsed) parsedSequence.push(parsed);
      const em = resolveNotationToEngineMove(board, tok);
      if (!em?.fenAfter) break;
      try {
        board = fenToBoardState(em.fenAfter);
        applied += 1;
      } catch {
        break;
      }
    }
    if (applied === 0) {
      setSequenceInfo(t("Could not apply moves on start position.", "Kon zetten niet toepassen op startpositie."));
      return;
    }
    const fenToStore = boardStateToFen(board);
    if (!fenToStore) {
      setSequenceInfo(t("Could not derive target FEN.", "Kon doel-FEN niet afleiden."));
      return;
    }
    setTargetFenDraft(fenToStore);
    patchIx({
      targetFen: fenToStore,
      solutionSequence: parsedSequence.length ? parsedSequence : undefined,
      expectedPlacement: normalizeExpectedPlacement([]),
    });
    setSequenceInfo(
      t("Target generated from sequence.", "Doelopstelling gegenereerd uit reeks") +
        ` (${applied}/${tokens.length})`
    );
  };

  const handleDeriveMissingFromStartAndTarget = () => {
    const startFen =
      (moment.positionRef?.type === "fen" ? moment.positionRef.fen : boardFenForCapture).trim();
    const endFen = targetFenDraft.trim();
    if (!startFen || !endFen) {
      setSequenceInfo(
        t(
          "Set both start FEN and target FEN first.",
          "Vul eerst zowel start-FEN als doel-FEN in."
        )
      );
      return;
    }
    try {
      const start = fenToBoardState(startFen);
      const end = fenToBoardState(endFen);
      const base = ix.previewStartsEmpty ? createEmptyBoardState() : start;
      const missing: PlacePiecesExpectedSlot[] = [];
      for (let sq = 1; sq <= 50; sq += 1) {
        const a = base.squares[sq];
        const b = end.squares[sq];
        if ((a === "empty" || !a) && b !== "empty") {
          if (b === "wm" || b === "wk" || b === "bm" || b === "bk") {
            missing.push({ square: sq, piece: b });
          }
        }
      }
      patchIx({ targetFen: endFen, expectedPlacement: normalizeExpectedPlacement(missing) });
      setSequenceInfo(
        t("Missing pieces derived.", "Ontbrekende stukken afgeleid.") + ` (${missing.length})`
      );
    } catch {
      setSequenceInfo(t("Start or target FEN is invalid.", "Start- of doel-FEN is ongeldig."));
    }
  };

  const promptPlain = readLocalizedText(ix.prompt, language);

  return (
    <div style={rootStyle}>
      <div style={titleStyle}>{t("placePieces (preview)", "placePieces (preview)")}</div>
      <button type="button" style={comfortBtnStyle} onClick={handleUseBoardAsStart}>
        {t("Use current board as start position", "Gebruik huidig bord als startpositie")}
      </button>
      <button
        type="button"
        style={comfortBtnStyle}
        onClick={() => {
          const fen = boardFenForCapture;
          setTargetFenDraft(fen);
          if (fen) patchIx({ targetFen: fen });
        }}
      >
        {t("Use current board as target FEN", "Gebruik huidig bord als doel-FEN")}
      </button>
      <label style={labelStyle}>
        {t("Start FEN", "Start-FEN")}
        <input
          type="text"
          style={inputStyle}
          value={moment.positionRef?.type === "fen" ? moment.positionRef.fen : ""}
          placeholder={t("Paste start FEN", "Plak start-FEN")}
          onChange={(e) =>
            onApply({
              ...moment,
              positionRef: { type: "fen", fen: e.target.value },
            })
          }
        />
      </label>
      <label style={labelStyle}>
        {t("Target FEN", "Doel-FEN")}
        <input
          type="text"
          style={inputStyle}
          value={targetFenDraft}
          placeholder={t("Paste end FEN", "Plak eind-FEN")}
          onChange={(e) => {
            setTargetFenDraft(e.target.value);
            patchIx({ targetFen: e.target.value });
          }}
        />
      </label>
      <div style={comfortRowStyle}>
        <button type="button" style={miniComfortBtnStyle} onClick={handleDeriveMissingFromStartAndTarget}>
          {t("Derive missing pieces", "Leid missende stukken af")}
        </button>
      </div>
      <label style={checkRowStyle}>
        <input
          type="checkbox"
          checked={!!ix.previewStartsEmpty}
          onChange={(e) => patchIx({ previewStartsEmpty: e.target.checked })}
        />
        {t("Hard mode: preview starts empty", "Moeilijk: preview start leeg")}
      </label>
      <label style={labelStyle}>
        {t("Generate target from move sequence", "Genereer doel uit zettenreeks")}
        <textarea
          rows={3}
          style={sequenceTextareaStyle}
          value={sequenceDraft}
          placeholder="31-27 18x29 33x24"
          onChange={(e) => setSequenceDraft(e.target.value)}
        />
      </label>
      <div style={comfortRowStyle}>
        <button type="button" style={miniComfortBtnStyle} onClick={handleGenerateTargetFromSequence}>
          {t("Generate target", "Genereer doel")}
        </button>
      </div>
      {sequenceInfo ? <p style={hintTinyStyle}>{sequenceInfo}</p> : null}
      <label style={labelStyle}>
        {t("Prompt (optional)", "Prompt (optioneel)")}
        <input
          type="text"
          style={inputStyle}
          value={promptPlain}
          placeholder={t("Short instruction", "Korte instructie")}
          onChange={(e) =>
            patchIx({
              prompt: writeLocalizedText(ix.prompt ?? createLocalizedText("", ""), language, e.target.value),
            })
          }
        />
      </label>
    </div>
  );
}

const comfortRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const miniComfortBtnStyle: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #34d399",
  background: "#d1fae5",
  fontWeight: 700,
  fontSize: 11,
  cursor: "pointer",
  color: "#064e3b",
};

const rootStyle: CSSProperties = {
  marginTop: 10,
  padding: 10,
  borderRadius: 10,
  border: "1px solid #a7f3d0",
  background: "#ecfdf5",
  display: "grid",
  gap: 8,
};

const titleStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#047857",
};

const comfortBtnStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #34d399",
  background: "#d1fae5",
  fontWeight: 800,
  fontSize: 11,
  cursor: "pointer",
  color: "#064e3b",
  justifySelf: "start",
};

const hintTinyStyle: CSSProperties = {
  margin: 0,
  fontSize: 10,
  color: "#047857",
  lineHeight: 1.35,
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 11,
  fontWeight: 600,
  color: "#064e3b",
};

const checkRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  fontWeight: 600,
  color: "#064e3b",
};

const inputStyle: CSSProperties = {
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #6ee7b7",
  fontSize: 12,
};

const sequenceTextareaStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #6ee7b7",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 12,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  background: "#fff",
  color: "#064e3b",
  resize: "vertical",
};
