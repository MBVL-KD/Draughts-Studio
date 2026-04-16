import type {
  CameraAction,
  CoachAction,
  FxAction,
  TimingSpec,
  UiAction,
} from "../types/authoring/presentationRuntimeTypes";
import type { StepMoment } from "../types/authoring/timelineTypes";
import { createLocalizedText } from "./i18nHelpers";

function coachOrEmpty(m: StepMoment): CoachAction[] {
  return m.coach ?? [];
}

function uiOrEmpty(m: StepMoment): UiAction[] {
  return m.ui ?? [];
}

function cameraOrEmpty(m: StepMoment): CameraAction[] {
  return m.camera ?? [];
}

function fxOrEmpty(m: StepMoment): FxAction[] {
  return m.fx ?? [];
}

export function setMomentTiming(
  moment: StepMoment,
  timing: TimingSpec | undefined
): StepMoment {
  if (!timing) {
    const { timing: _, ...rest } = moment;
    return rest;
  }
  const hasAny = Object.values(timing).some((v) => v !== undefined);
  if (!hasAny) {
    const { timing: _, ...rest } = moment;
    return rest;
  }
  return { ...moment, timing };
}

export function patchMomentTiming(
  moment: StepMoment,
  partial: Partial<TimingSpec>
): StepMoment {
  return setMomentTiming(moment, { ...moment.timing, ...partial });
}

export function appendCoach(moment: StepMoment, action: CoachAction): StepMoment {
  return { ...moment, coach: [...coachOrEmpty(moment), action] };
}

export function replaceCoachAt(
  moment: StepMoment,
  index: number,
  action: CoachAction
): StepMoment {
  const list = [...coachOrEmpty(moment)];
  if (index < 0 || index >= list.length) return moment;
  list[index] = action;
  return { ...moment, coach: list };
}

export function removeCoachAt(moment: StepMoment, index: number): StepMoment {
  const list = coachOrEmpty(moment).filter((_, i) => i !== index);
  return { ...moment, coach: list.length ? list : undefined };
}

export function moveCoachUp(moment: StepMoment, index: number): StepMoment {
  if (index <= 0) return moment;
  const list = [...coachOrEmpty(moment)];
  [list[index - 1], list[index]] = [list[index]!, list[index - 1]!];
  return { ...moment, coach: list };
}

export function moveCoachDown(moment: StepMoment, index: number): StepMoment {
  const list = [...coachOrEmpty(moment)];
  if (index < 0 || index >= list.length - 1) return moment;
  [list[index], list[index + 1]] = [list[index + 1]!, list[index]!];
  return { ...moment, coach: list };
}

export function appendUi(moment: StepMoment, action: UiAction): StepMoment {
  return { ...moment, ui: [...uiOrEmpty(moment), action] };
}

export function replaceUiAt(moment: StepMoment, index: number, action: UiAction): StepMoment {
  const list = [...uiOrEmpty(moment)];
  if (index < 0 || index >= list.length) return moment;
  list[index] = action;
  return { ...moment, ui: list };
}

export function removeUiAt(moment: StepMoment, index: number): StepMoment {
  const list = uiOrEmpty(moment).filter((_, i) => i !== index);
  return { ...moment, ui: list.length ? list : undefined };
}

export function moveUiUp(moment: StepMoment, index: number): StepMoment {
  if (index <= 0) return moment;
  const list = [...uiOrEmpty(moment)];
  [list[index - 1], list[index]] = [list[index]!, list[index - 1]!];
  return { ...moment, ui: list };
}

export function moveUiDown(moment: StepMoment, index: number): StepMoment {
  const list = [...uiOrEmpty(moment)];
  if (index < 0 || index >= list.length - 1) return moment;
  [list[index], list[index + 1]] = [list[index + 1]!, list[index]!];
  return { ...moment, ui: list };
}

export function appendCamera(moment: StepMoment, action: CameraAction): StepMoment {
  return { ...moment, camera: [...cameraOrEmpty(moment), action] };
}

export function replaceCameraAt(
  moment: StepMoment,
  index: number,
  action: CameraAction
): StepMoment {
  const list = [...cameraOrEmpty(moment)];
  if (index < 0 || index >= list.length) return moment;
  list[index] = action;
  return { ...moment, camera: list };
}

export function removeCameraAt(moment: StepMoment, index: number): StepMoment {
  const list = cameraOrEmpty(moment).filter((_, i) => i !== index);
  return { ...moment, camera: list.length ? list : undefined };
}

export function moveCameraUp(moment: StepMoment, index: number): StepMoment {
  if (index <= 0) return moment;
  const list = [...cameraOrEmpty(moment)];
  [list[index - 1], list[index]] = [list[index]!, list[index - 1]!];
  return { ...moment, camera: list };
}

export function moveCameraDown(moment: StepMoment, index: number): StepMoment {
  const list = [...cameraOrEmpty(moment)];
  if (index < 0 || index >= list.length - 1) return moment;
  [list[index], list[index + 1]] = [list[index + 1]!, list[index]!];
  return { ...moment, camera: list };
}

export function appendFx(moment: StepMoment, action: FxAction): StepMoment {
  return { ...moment, fx: [...fxOrEmpty(moment), action] };
}

export function replaceFxAt(moment: StepMoment, index: number, action: FxAction): StepMoment {
  const list = [...fxOrEmpty(moment)];
  if (index < 0 || index >= list.length) return moment;
  list[index] = action;
  return { ...moment, fx: list };
}

export function removeFxAt(moment: StepMoment, index: number): StepMoment {
  const list = fxOrEmpty(moment).filter((_, i) => i !== index);
  return { ...moment, fx: list.length ? list : undefined };
}

export function moveFxUp(moment: StepMoment, index: number): StepMoment {
  if (index <= 0) return moment;
  const list = [...fxOrEmpty(moment)];
  [list[index - 1], list[index]] = [list[index]!, list[index - 1]!];
  return { ...moment, fx: list };
}

export function moveFxDown(moment: StepMoment, index: number): StepMoment {
  const list = [...fxOrEmpty(moment)];
  if (index < 0 || index >= list.length - 1) return moment;
  [list[index], list[index + 1]] = [list[index + 1]!, list[index]!];
  return { ...moment, fx: list };
}

export function createDefaultCoachAction(): CoachAction {
  return {
    mode: "bubble",
    text: createLocalizedText("Coach text", "Coach-tekst"),
    tone: "warm",
  };
}

export function createDefaultUiHint(): UiAction {
  return { type: "showHint", text: createLocalizedText("Hint", "Tip") };
}

export function createDefaultUiBanner(): UiAction {
  return {
    type: "showBanner",
    text: createLocalizedText("Banner", "Banner"),
    style: "info",
  };
}

export function createDefaultUiToggleHud(): UiAction {
  return { type: "toggleHud", visible: true };
}

export function createDefaultCameraNone(): CameraAction {
  return { type: "none" };
}

export function createDefaultCameraFocusSquare(): CameraAction {
  return { type: "focusSquare", square: 31, zoom: 1.1, durationMs: 400 };
}

export function createDefaultCameraFocusMove(): CameraAction {
  return { type: "focusMove", from: 31, to: 35, zoom: 1.05, durationMs: 500 };
}

export function createDefaultCameraFrameArea(): CameraAction {
  return { type: "frameArea", squares: [31, 32, 33, 35], durationMs: 600 };
}

export function createDefaultCameraFollowPiece(): CameraAction {
  return { type: "followPiece", square: 31, durationMs: 400 };
}

export function createDefaultCameraReset(): CameraAction {
  return { type: "reset", durationMs: 300 };
}

export function createDefaultFxPulse(): FxAction {
  return { type: "squarePulse", squares: [31], durationMs: 500 };
}

export function createDefaultFxPieceGlow(): FxAction {
  return { type: "pieceGlow", squares: [31], durationMs: 600 };
}

export function createDefaultFxParticles(): FxAction {
  return {
    type: "particles",
    particleKind: "spark",
    square: 31,
    durationMs: 400,
  };
}

export function createDefaultFxScreenFx(): FxAction {
  return { type: "screenFx", effect: "flash", durationMs: 250 };
}

export function createDefaultFxSoundCue(): FxAction {
  return { type: "soundCue", soundId: "click", volume: 0.8 };
}
