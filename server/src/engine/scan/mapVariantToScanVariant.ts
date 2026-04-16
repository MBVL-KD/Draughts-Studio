/** Mirrors client/src/engine/mapVariantToEngine.ts (kept server-local for CJS/ts-node). */
export function mapVariantToScanVariant(variantId: string): string | null {
  switch (variantId) {
    case "international":
      return "normal";
    case "frisian":
      return "frisian";
    case "killer":
      return "killer";
    case "breakthrough":
      return "bt";
    case "losing":
      return "losing";
    default:
      return null;
  }
}
