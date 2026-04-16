import { useState } from "react";
import type { CSSProperties } from "react";
import type {
  CameraAction,
  CoachAction,
  CoachTone,
  FxAction,
  UiAction,
} from "../types/authoring/presentationRuntimeTypes";
import type { StepMoment } from "../types/authoring/timelineTypes";
import type { LanguageCode } from "../types/i18nTypes";
import { readLocalizedText, writeLocalizedText } from "../utils/i18nHelpers";
import {
  appendCamera,
  appendCoach,
  appendFx,
  appendUi,
  createDefaultCameraFocusMove,
  createDefaultCameraFocusSquare,
  createDefaultCameraFollowPiece,
  createDefaultCameraFrameArea,
  createDefaultCameraNone,
  createDefaultCameraReset,
  createDefaultCoachAction,
  createDefaultFxParticles,
  createDefaultFxPieceGlow,
  createDefaultFxPulse,
  createDefaultFxScreenFx,
  createDefaultFxSoundCue,
  createDefaultUiBanner,
  createDefaultUiHint,
  createDefaultUiToggleHud,
  moveCameraDown,
  moveCameraUp,
  moveCoachDown,
  moveCoachUp,
  moveFxDown,
  moveFxUp,
  moveUiDown,
  moveUiUp,
  patchMomentTiming,
  removeCameraAt,
  removeCoachAt,
  removeFxAt,
  removeUiAt,
  replaceCameraAt,
  replaceCoachAt,
  replaceFxAt,
  replaceUiAt,
  setMomentTiming,
} from "../utils/authoringMomentRuntime";

type Props = {
  moment: StepMoment;
  language: LanguageCode;
  onApply: (next: StepMoment) => void;
};

const COACH_MODES: CoachAction["mode"][] = ["bubble", "panel", "voice", "caption"];

const COACH_TONE_OPTIONS: { value: CoachTone; en: string; nl: string }[] = [
  { value: "neutral", en: "Neutral", nl: "Neutraal" },
  { value: "warm", en: "Explain / calm", nl: "Uitleg / rustig" },
  { value: "excited", en: "Excited", nl: "Enthousiast" },
  { value: "warning", en: "Warning", nl: "Waarschuwing" },
  { value: "corrective", en: "Correction", nl: "Correctie" },
  { value: "celebratory", en: "Success", nl: "Succes" },
];

function parseNums(raw: string): number[] {
  return raw
    .split(/[,;\s]+/)
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 50);
}

function fmtNums(a: number[]): string {
  return a.join(", ");
}

export default function AuthoringMomentRuntimePanel({ moment, language, onApply }: Props) {
  const t = (en: string, nl: string) => (language === "nl" ? nl : en);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [coachCollapsed, setCoachCollapsed] = useState(false);
  const timing = moment.timing ?? {};

  const rowBtns = (onUp: () => void, onDown: () => void, onDel: () => void) => (
    <div style={rowBtn}>
      <button type="button" style={mini} onClick={onUp}>
        ↑
      </button>
      <button type="button" style={mini} onClick={onDown}>
        ↓
      </button>
      <button type="button" style={del} onClick={onDel}>
        ×
      </button>
    </div>
  );

  return (
    <div style={root}>
      <div style={secHeader}>
        <div style={title}>{t("Coach & runtime", "Coach & runtime")}</div>
        <button type="button" style={collapseBtnStyle} onClick={() => setPanelCollapsed((v) => !v)}>
          {panelCollapsed ? t("Expand", "Openklappen") : t("Collapse", "Inklappen")}
        </button>
      </div>
      {!panelCollapsed ? (
        <>
          <p style={hint}>
            {t(
              "Semantic tones for coach; camera/FX are stored for future playback (no execution here).",
              "Semantische coach-tonen; camera/FX worden bewaard voor latere playback (hier geen uitvoering)."
            )}
          </p>

      <div style={sec}>{t("Timing", "Timing")}</div>
      <div style={timingGrid}>
        <label style={inl}>
          <input
            type="checkbox"
            checked={!!timing.autoPlay}
            onChange={(e) =>
              onApply(patchMomentTiming(moment, { autoPlay: e.target.checked }))
            }
          />
          autoPlay
        </label>
        <label style={inl}>
          <input
            type="checkbox"
            checked={!!timing.waitForUser}
            onChange={(e) =>
              onApply(patchMomentTiming(moment, { waitForUser: e.target.checked }))
            }
          />
          waitForUser
        </label>
        <label style={lbl}>
          startDelayMs
          <input
            type="number"
            style={inp}
            min={0}
            value={timing.startDelayMs ?? ""}
            onChange={(e) =>
              onApply(
                patchMomentTiming(moment, {
                  startDelayMs: e.target.value === "" ? undefined : Number(e.target.value),
                })
              )
            }
          />
        </label>
        <label style={lbl}>
          durationMs
          <input
            type="number"
            style={inp}
            min={0}
            value={timing.durationMs ?? ""}
            onChange={(e) =>
              onApply(
                patchMomentTiming(moment, {
                  durationMs: e.target.value === "" ? undefined : Number(e.target.value),
                })
              )
            }
          />
        </label>
        <label style={lbl}>
          pauseAfterMs
          <input
            type="number"
            style={inp}
            min={0}
            value={timing.pauseAfterMs ?? ""}
            onChange={(e) =>
              onApply(
                patchMomentTiming(moment, {
                  pauseAfterMs: e.target.value === "" ? undefined : Number(e.target.value),
                })
              )
            }
          />
        </label>
        <button
          type="button"
          style={clearBtn}
          onClick={() => onApply(setMomentTiming(moment, undefined))}
        >
          {t("Clear timing", "Timing wissen")}
        </button>
      </div>

      <div style={secHeader}>
        <div style={sec}>{t("Coach", "Coach")}</div>
        <button type="button" style={collapseBtnStyle} onClick={() => setCoachCollapsed((v) => !v)}>
          {coachCollapsed ? t("Expand", "Openklappen") : t("Collapse", "Inklappen")}
        </button>
      </div>
      {!coachCollapsed && (moment.coach ?? []).length === 0 ? (
        <div style={empty}>{t("No coach entries.", "Geen coach-regels.")}</div>
      ) : null}
      {!coachCollapsed && (moment.coach ?? []).map((c, i) => (
        <div key={i} style={card}>
          <div style={cardHead}>
            <span style={badge}>coach</span>
            {rowBtns(
              () => onApply(moveCoachUp(moment, i)),
              () => onApply(moveCoachDown(moment, i)),
              () => onApply(removeCoachAt(moment, i))
            )}
          </div>
          <label style={lbl}>
            {t("Text", "Tekst")}
            <input
              style={inp}
              value={readLocalizedText(c.text, language)}
              onChange={(e) =>
                onApply(
                  replaceCoachAt(moment, i, {
                    ...c,
                    text: writeLocalizedText(c.text, language, e.target.value),
                  })
                )
              }
            />
          </label>
          <label style={lbl}>
            {t("Mode", "Modus")}
            <select
              style={inp}
              value={c.mode}
              onChange={(e) =>
                onApply(
                  replaceCoachAt(moment, i, {
                    ...c,
                    mode: e.target.value as CoachAction["mode"],
                  })
                )
              }
            >
              {COACH_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label style={lbl}>
            {t("Tone (semantic)", "Toon (semantisch)")}
            <select
              style={inp}
              value={c.tone ?? "neutral"}
              onChange={(e) =>
                onApply(
                  replaceCoachAt(moment, i, {
                    ...c,
                    tone: e.target.value as CoachTone,
                  })
                )
              }
            >
              {COACH_TONE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {language === "nl" ? o.nl : o.en}
                </option>
              ))}
            </select>
          </label>
          <label style={lbl}>
            {t("NPC id (optional)", "NPC-id (optioneel)")}
            <input
              style={inp}
              value={c.npcId ?? ""}
              onChange={(e) =>
                onApply(
                  replaceCoachAt(moment, i, {
                    ...c,
                    npcId: e.target.value.trim() || undefined,
                  })
                )
              }
            />
          </label>
          <label style={lbl}>
            autoAdvanceAfterMs
            <input
              type="number"
              style={inp}
              min={0}
              value={c.autoAdvanceAfterMs ?? ""}
              onChange={(e) =>
                onApply(
                  replaceCoachAt(moment, i, {
                    ...c,
                    autoAdvanceAfterMs:
                      e.target.value === "" ? undefined : Number(e.target.value),
                  })
                )
              }
            />
          </label>
        </div>
      ))}
      {!coachCollapsed && <button type="button" style={addWide} onClick={() => onApply(appendCoach(moment, createDefaultCoachAction()))}>
        + {t("Coach", "Coach")}
      </button>}

      <div style={sec}>{t("UI", "UI")}</div>
      {(moment.ui ?? []).map((u, i) => (
        <div key={i} style={card}>
          <div style={cardHead}>
            <span style={badge}>{u.type}</span>
            {rowBtns(
              () => onApply(moveUiUp(moment, i)),
              () => onApply(moveUiDown(moment, i)),
              () => onApply(removeUiAt(moment, i))
            )}
          </div>
          {u.type === "showHint" || u.type === "showBanner" ? (
            <label style={lbl}>
              {t("Text", "Tekst")}
              <input
                style={inp}
                value={readLocalizedText(u.text, language)}
                onChange={(e) =>
                  onApply(
                    replaceUiAt(moment, i, {
                      ...u,
                      text: writeLocalizedText(u.text, language, e.target.value),
                    } as UiAction)
                  )
                }
              />
            </label>
          ) : null}
          {u.type === "showBanner" ? (
            <label style={lbl}>
              {t("Banner style", "Bannerstijl")}
              <select
                style={inp}
                value={u.style ?? "info"}
                onChange={(e) =>
                  onApply(
                    replaceUiAt(moment, i, {
                      ...u,
                      style: e.target.value as "info" | "warning" | "success" | "error",
                    })
                  )
                }
              >
                {(["info", "warning", "success", "error"] as const).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {u.type === "toggleHud" ? (
            <label style={inl}>
              <input
                type="checkbox"
                checked={u.visible}
                onChange={(e) =>
                  onApply(replaceUiAt(moment, i, { ...u, visible: e.target.checked }))
                }
              />
              {t("HUD visible", "HUD zichtbaar")}
            </label>
          ) : null}
        </div>
      ))}
      <div style={addRow}>
        <button type="button" style={add} onClick={() => onApply(appendUi(moment, createDefaultUiHint()))}>
          + hint
        </button>
        <button type="button" style={add} onClick={() => onApply(appendUi(moment, createDefaultUiBanner()))}>
          + banner
        </button>
        <button type="button" style={add} onClick={() => onApply(appendUi(moment, createDefaultUiToggleHud()))}>
          + HUD
        </button>
      </div>

      <div style={sec}>{t("Camera (data)", "Camera (data)")}</div>
      {(moment.camera ?? []).map((c, i) => (
        <div key={i} style={card}>
          <div style={cardHead}>
            <span style={badge}>camera</span>
            {rowBtns(
              () => onApply(moveCameraUp(moment, i)),
              () => onApply(moveCameraDown(moment, i)),
              () => onApply(removeCameraAt(moment, i))
            )}
          </div>
          <label style={lbl}>
            type
            <select
              style={inp}
              value={c.type}
              onChange={(e) => {
                const v = e.target.value;
                let next: CameraAction = createDefaultCameraNone();
                if (v === "focusSquare") next = createDefaultCameraFocusSquare();
                else if (v === "focusMove") next = createDefaultCameraFocusMove();
                else if (v === "frameArea") next = createDefaultCameraFrameArea();
                else if (v === "followPiece") next = createDefaultCameraFollowPiece();
                else if (v === "reset") next = createDefaultCameraReset();
                onApply(replaceCameraAt(moment, i, next));
              }}
            >
              {(
                ["none", "focusSquare", "focusMove", "frameArea", "followPiece", "reset"] as const
              ).map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          {c.type === "focusSquare" || c.type === "followPiece" ? (
            <label style={lbl}>
              square
              <input
                type="number"
                style={inp}
                min={1}
                max={50}
                value={c.square}
                onChange={(e) =>
                  onApply(
                    replaceCameraAt(moment, i, {
                      ...c,
                      square: Number(e.target.value) || c.square,
                    })
                  )
                }
              />
            </label>
          ) : null}
          {c.type === "focusMove" ? (
            <div style={grid2}>
              <label style={lbl}>
                from
                <input
                  type="number"
                  style={inp}
                  min={1}
                  max={50}
                  value={c.from}
                  onChange={(e) =>
                    onApply(
                      replaceCameraAt(moment, i, {
                        ...c,
                        from: Number(e.target.value) || c.from,
                      })
                    )
                  }
                />
              </label>
              <label style={lbl}>
                to
                <input
                  type="number"
                  style={inp}
                  min={1}
                  max={50}
                  value={c.to}
                  onChange={(e) =>
                    onApply(
                      replaceCameraAt(moment, i, {
                        ...c,
                        to: Number(e.target.value) || c.to,
                      })
                    )
                  }
                />
              </label>
            </div>
          ) : null}
          {c.type === "frameArea" ? (
            <label style={lbl}>
              squares
              <input
                style={inp}
                value={fmtNums(c.squares)}
                onChange={(e) =>
                  onApply(
                    replaceCameraAt(moment, i, {
                      ...c,
                      squares: parseNums(e.target.value),
                    })
                  )
                }
              />
            </label>
          ) : null}
          {c.type !== "none" ? (
            <label style={lbl}>
              durationMs
              <input
                type="number"
                style={inp}
                min={0}
                value={c.durationMs ?? ""}
                onChange={(e) =>
                  onApply(
                    replaceCameraAt(moment, i, {
                      ...c,
                      durationMs:
                        e.target.value === "" ? undefined : Number(e.target.value),
                    } as CameraAction)
                  )
                }
              />
            </label>
          ) : null}
          {(c.type === "focusSquare" || c.type === "focusMove") && "zoom" in c ? (
            <label style={lbl}>
              zoom
              <input
                type="number"
                step={0.05}
                style={inp}
                value={c.zoom ?? ""}
                onChange={(e) =>
                  onApply(
                    replaceCameraAt(moment, i, {
                      ...c,
                      zoom: e.target.value === "" ? undefined : Number(e.target.value),
                    } as CameraAction)
                  )
                }
              />
            </label>
          ) : null}
        </div>
      ))}
      <button type="button" style={addWide} onClick={() => onApply(appendCamera(moment, createDefaultCameraNone()))}>
        + camera
      </button>

      <div style={sec}>{t("FX (data)", "FX (data)")}</div>
      {(moment.fx ?? []).map((f, i) => (
        <div key={i} style={card}>
          <div style={cardHead}>
            <span style={badge}>fx</span>
            {rowBtns(
              () => onApply(moveFxUp(moment, i)),
              () => onApply(moveFxDown(moment, i)),
              () => onApply(removeFxAt(moment, i))
            )}
          </div>
          <label style={lbl}>
            type
            <select
              style={inp}
              value={f.type}
              onChange={(e) => {
                const v = e.target.value;
                let next: FxAction = createDefaultFxPulse();
                if (v === "pieceGlow") next = createDefaultFxPieceGlow();
                else if (v === "particles") next = createDefaultFxParticles();
                else if (v === "screenFx") next = createDefaultFxScreenFx();
                else if (v === "soundCue") next = createDefaultFxSoundCue();
                else if (v === "squarePulse") next = createDefaultFxPulse();
                onApply(replaceFxAt(moment, i, next));
              }}
            >
              {(["squarePulse", "pieceGlow", "particles", "screenFx", "soundCue"] as const).map(
                (x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                )
              )}
            </select>
          </label>
          {(f.type === "squarePulse" || f.type === "pieceGlow") && "squares" in f ? (
            <label style={lbl}>
              squares
              <input
                style={inp}
                value={fmtNums(f.squares)}
                onChange={(e) =>
                  onApply(
                    replaceFxAt(moment, i, {
                      ...f,
                      squares: parseNums(e.target.value),
                    })
                  )
                }
              />
            </label>
          ) : null}
          {f.type === "particles" ? (
            <>
              <label style={lbl}>
                particleKind
                <select
                  style={inp}
                  value={f.particleKind}
                  onChange={(e) =>
                    onApply(
                      replaceFxAt(moment, i, {
                        ...f,
                        particleKind: e.target.value as typeof f.particleKind,
                      })
                    )
                  }
                >
                  {(["spark", "burst", "promotion", "warning", "trail"] as const).map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
              <label style={lbl}>
                square (optional)
                <input
                  type="number"
                  style={inp}
                  min={1}
                  max={50}
                  value={f.square ?? ""}
                  onChange={(e) =>
                    onApply(
                      replaceFxAt(moment, i, {
                        ...f,
                        square: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    )
                  }
                />
              </label>
            </>
          ) : null}
          {f.type === "screenFx" ? (
            <label style={lbl}>
              effect
              <select
                style={inp}
                value={f.effect}
                onChange={(e) =>
                  onApply(
                    replaceFxAt(moment, i, {
                      ...f,
                      effect: e.target.value as typeof f.effect,
                    })
                  )
                }
              >
                {(["shake", "flash", "success"] as const).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {f.type === "soundCue" ? (
            <>
              <label style={lbl}>
                soundId
                <input
                  style={inp}
                  value={f.soundId}
                  onChange={(e) =>
                    onApply(replaceFxAt(moment, i, { ...f, soundId: e.target.value }))
                  }
                />
              </label>
              <label style={lbl}>
                volume
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  style={inp}
                  value={f.volume ?? ""}
                  onChange={(e) =>
                    onApply(
                      replaceFxAt(moment, i, {
                        ...f,
                        volume: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    )
                  }
                />
              </label>
            </>
          ) : null}
          {"durationMs" in f ? (
            <label style={lbl}>
              durationMs
              <input
                type="number"
                style={inp}
                min={0}
                value={f.durationMs ?? ""}
                onChange={(e) =>
                  onApply(
                    replaceFxAt(moment, i, {
                      ...f,
                      durationMs:
                        e.target.value === "" ? undefined : Number(e.target.value),
                    } as FxAction)
                  )
                }
              />
            </label>
          ) : null}
        </div>
      ))}
          <button type="button" style={addWide} onClick={() => onApply(appendFx(moment, createDefaultFxPulse()))}>
            + fx
          </button>
        </>
      ) : null}
    </div>
  );
}

const root: CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #fef3c7",
  background: "#fffbeb",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const title: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#b45309",
};

const hint: CSSProperties = {
  fontSize: 11,
  color: "#78716c",
  margin: 0,
  lineHeight: 1.45,
};

const sec: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: "#44403c",
  marginTop: 4,
};

const secHeader: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const collapseBtnStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "4px 8px",
  borderRadius: 8,
  border: "1px solid #d6d3d1",
  background: "#fff",
  color: "#44403c",
  cursor: "pointer",
};

const empty: CSSProperties = { fontSize: 11, color: "#a8a29e", fontStyle: "italic" };

const card: CSSProperties = {
  border: "1px solid #fde68a",
  borderRadius: 8,
  padding: 8,
  background: "#fff",
  display: "grid",
  gap: 6,
};

const cardHead: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const badge: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  textTransform: "uppercase",
  color: "#78716c",
};

const lbl: CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 10,
  fontWeight: 700,
  color: "#57534e",
};

const inl: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  fontWeight: 600,
};

const inp: CSSProperties = {
  fontSize: 12,
  padding: "5px 8px",
  borderRadius: 6,
  border: "1px solid #d6d3d1",
};

const timingGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
  alignItems: "center",
};

const rowBtn: CSSProperties = { display: "flex", gap: 4 };
const mini: CSSProperties = {
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 6,
  border: "1px solid #e7e5e4",
  background: "#fff",
  cursor: "pointer",
};
const del: CSSProperties = { ...mini, borderColor: "#fecaca", color: "#b91c1c" };

const add: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "5px 8px",
  borderRadius: 8,
  border: "1px solid #fcd34d",
  background: "#fffbeb",
  cursor: "pointer",
};

const addRow: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6 };
const addWide: CSSProperties = { ...add, alignSelf: "flex-start" };

const clearBtn: CSSProperties = {
  ...add,
  gridColumn: "1 / -1",
  justifySelf: "start",
};

const grid2: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
};
