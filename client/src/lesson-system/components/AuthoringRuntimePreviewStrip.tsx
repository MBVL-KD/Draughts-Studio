import type { CSSProperties } from "react";
import type { AuthoringPreviewResolved } from "../utils/resolveAuthoringPreviewState";
import type { LanguageCode } from "../types/i18nTypes";

type Props = {
  preview: AuthoringPreviewResolved | null | undefined;
  language: LanguageCode;
};

export default function AuthoringRuntimePreviewStrip({ preview, language }: Props) {
  const t = (en: string, nl: string) => (language === "nl" ? nl : en);
  if (!preview) return null;

  const coach = preview.coachPreviewLines ?? [];
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
          {coach.map((line, i) => (
            <div key={i} style={coachLine}>
              {line}
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

const coachBlock: CSSProperties = { display: "grid", gap: 4 };

const coachLine: CSSProperties = {
  padding: "4px 6px",
  background: "#fff",
  borderRadius: 6,
  border: "1px solid #e2e8f0",
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
