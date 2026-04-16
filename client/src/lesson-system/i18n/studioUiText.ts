import type { LanguageCode } from "../types/i18nTypes";

const TEXTS = {
  sourceTabAnalyze: { en: "Analyze", nl: "Analyse" },
  sourceTabSetup: { en: "Setup", nl: "Opstelling" },
  sourceTabImport: { en: "Import", nl: "Import" },
  sourceTabPreview: { en: "Preview", nl: "Voorbeeld" },
  sourceShowMovetext: { en: "Show movetext", nl: "Toon zettenlijst" },
  sourceHideMovetext: { en: "Hide movetext", nl: "Verberg zettenlijst" },
  sourceShowInspector: { en: "Show inspector", nl: "Toon inspector" },
  sourceHideInspector: { en: "Hide inspector", nl: "Verberg inspector" },
  sourceNoNodeSelected: { en: "No node selected", nl: "Geen node geselecteerd" },
  sourceRootPosition: { en: "Root position", nl: "Startpositie" },
  sourcePly: { en: "Ply", nl: "Ply" },
  importTitle: { en: "Import position or game", nl: "Importeer positie of partij" },
  importSubtitle: { en: "Import a FEN or PDN to quickly build a source.", nl: "Importeer een FEN of PDN om snel een bron op te bouwen." },
  importResult: { en: "Import result", nl: "Import resultaat" },
  importFen: { en: "FEN import", nl: "FEN import" },
  importPdn: { en: "PDN import", nl: "PDN import" },
  importFenHelp: { en: "Paste a FEN string to set a new root position instantly.", nl: "Plak een FEN-string om direct een nieuwe startpositie te zetten." },
  importPdnHelp: { en: "Paste a full game in PDN format.", nl: "Plak een volledige partij in PDN-formaat." },
  importPdnNote: { en: "Note: parsing support will be expanded further.", nl: "Opmerking: parsing-ondersteuning wordt verder uitgebreid." },
  clear: { en: "Clear", nl: "Leegmaken" },
  moveText: { en: "Move text", nl: "Zettenlijst" },
  mainlineVariations: { en: "Main line & variations", nl: "Hoofdvariant & varianten" },
  eval: { en: "Eval", nl: "Evaluatie" },
  glyph: { en: "Glyph", nl: "Glyph" },
  nodes: { en: "Nodes", nl: "Nodes" },
  selected: { en: "Selected", nl: "Geselecteerd" },
  noMovesYet: { en: "No moves yet", nl: "Nog geen zetten" },
  moveUp: { en: "Move up", nl: "Omhoog" },
  moveDown: { en: "Move down", nl: "Omlaag" },
  preview: { en: "Preview", nl: "Voorbeeld" },
  replaySelectedLine: { en: "Replay selected line", nl: "Speel geselecteerde lijn af" },
  lineLength: { en: "Line length", nl: "Lijnlengte" },
  position: { en: "Position", nl: "Positie" },
  noLineAvailable: { en: "No line available.", nl: "Geen lijn beschikbaar." },
  currentPreviewNode: { en: "Current preview node", nl: "Huidige voorbeeld-node" },
  yes: { en: "Yes", nl: "Ja" },
  no: { en: "No", nl: "Nee" },
} as const;

export type StudioUiKey = keyof typeof TEXTS;

export function uiText(language: LanguageCode, key: StudioUiKey): string {
  return TEXTS[key][language] ?? TEXTS[key].en;
}
