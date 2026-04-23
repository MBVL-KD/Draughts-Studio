import type { CSSProperties } from "react";
import type { AuthoringPreviewResolved } from "../utils/resolveAuthoringPreviewState";
import type { LanguageCode } from "../types/i18nTypes";
import type { CoachTone } from "../types/authoring/presentationRuntimeTypes";
import neutralAvatar from "../assets/coach-girl/neutral.png";
import thinkingAvatar from "../assets/coach-girl/thinking.png";
import warmAvatar from "../assets/coach-girl/warm.png";
import encouragingAvatar from "../assets/coach-girl/encouraging.png";
import surprisedAvatar from "../assets/coach-girl/surprised.png";
import confusedAvatar from "../assets/coach-girl/confused.png";
import proudAvatar from "../assets/coach-girl/proud.png";
import playfulAvatar from "../assets/coach-girl/playful.png";
import excitedAvatar from "../assets/coach-girl/excited.png";
import warningAvatar from "../assets/coach-girl/warning.png";
import correctiveAvatar from "../assets/coach-girl/corrective.png";
import celebratoryAvatar from "../assets/coach-girl/celebratory.png";

type Props = {
  preview: AuthoringPreviewResolved | null | undefined;
  language: LanguageCode;
};

const COACH_AVATAR_BY_TONE: Record<CoachTone, string> = {
  neutral: neutralAvatar,
  thinking: thinkingAvatar,
  warm: warmAvatar,
  encouraging: encouragingAvatar,
  surprised: surprisedAvatar,
  confused: confusedAvatar,
  proud: proudAvatar,
  playful: playfulAvatar,
  excited: excitedAvatar,
  warning: warningAvatar,
  corrective: correctiveAvatar,
  celebratory: celebratoryAvatar,
};

export default function AuthoringRuntimePreviewStrip({ preview, language }: Props) {
  const t = (en: string, nl: string) => (language === "nl" ? nl : en);
  if (!preview) return null;

  const coach = preview.coachPreviewItems ?? [];
  const hint = preview.uiHintPreview;
  const banner = preview.uiBannerPreview;
  const timing = preview.timingSummary;
  const dev = preview.runtimeDevLabels ?? [];

  if (!coach.length && !hint && !banner && !timing && !dev.length) return null;

  const bannerColors: Record<string, string> = {
    info: "#1d4ed8",
    warning: "#b45309",
    success: "#15803d",
    error: "#b91c1c",
  };

  return (
    <div style={wrap}>
      <div style={title}>{t("Moment runtime (preview)", "Moment-runtime (preview)")}</div>
      {coach.length > 0 ? (
        <div style={coachBlock}>
          {coach.map((item, i) => (
            <div key={i} style={coachLine}>
              <div style={coachAvatarFrame}>
                <img
                  src={COACH_AVATAR_BY_TONE[item.tone] ?? neutralAvatar}
                  alt={item.tone}
                  style={coachAvatarImage}
                />
              </div>
              <div style={coachTextWrap}>
                <div style={coachMetaRow}>
                  <div style={coachNameLabel}>{t("Coach", "Coach")}</div>
                  <div style={coachToneLabel}>{item.tone}</div>
                </div>
                <div style={coachMessage}>{item.text}</div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {banner?.text ? (
        <div
          style={{
            ...bannerBox,
            borderColor: bannerColors[banner.style ?? "info"] ?? bannerColors.info,
            color: bannerColors[banner.style ?? "info"] ?? bannerColors.info,
          }}
        >
          <strong>{t("Banner", "Banner")}</strong> {banner.text}
        </div>
      ) : null}
      {hint ? (
        <div style={hintBox}>
          <strong>{t("Hint", "Tip")}</strong> {hint}
        </div>
      ) : null}
      {timing ? (
        <div style={timingBox}>
          <strong>{t("Timing", "Timing")}</strong> {timing}
        </div>
      ) : null}
      {dev.length > 0 ? (
        <ul style={devList}>
          {dev.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const wrap: CSSProperties = {
  marginTop: 8,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  fontSize: 12,
  lineHeight: 1.45,
  maxWidth: "100%",
};

const title: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#64748b",
  marginBottom: 6,
};

const coachBlock: CSSProperties = { display: "grid", gap: 6 };

const coachLine: CSSProperties = {
  padding: "10px 12px",
  background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
  borderRadius: 10,
  border: "none",
  boxShadow: "none",
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const coachAvatarFrame: CSSProperties = {
  width: 120,
  height: 120,
  borderRadius: 10,
  background: "#000",
  border: "none",
  flexShrink: 0,
  boxShadow: "none",
  overflow: "hidden",
  display: "grid",
  placeItems: "center",
};

const coachAvatarImage: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  transform: "scale(1.55)",
  transformOrigin: "center center",
};

const coachTextWrap: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 4,
};

const coachMetaRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const coachNameLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#1e293b",
};

const coachToneLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#334155",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  background: "#e2e8f0",
  border: "1px solid #cbd5e1",
  borderRadius: 999,
  padding: "2px 8px",
};

const coachMessage: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.35,
  color: "#0f172a",
};

const bannerBox: CSSProperties = {
  marginTop: 4,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid",
  background: "#fff",
};

const hintBox: CSSProperties = {
  marginTop: 4,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #bae6fd",
  background: "#f0f9ff",
  color: "#0369a1",
};

const timingBox: CSSProperties = {
  marginTop: 4,
  fontSize: 11,
  color: "#475569",
};

const devList: CSSProperties = {
  margin: "6px 0 0",
  paddingLeft: 18,
  fontSize: 10,
  color: "#64748b",
  fontFamily: "ui-monospace, monospace",
};
