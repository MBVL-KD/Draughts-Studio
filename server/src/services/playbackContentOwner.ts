export type PlaybackContentOwner = {
  ownerType: "user" | "school" | "org";
  ownerId: string;
};

/**
 * When the game sends Roblox user ids (e.g. -1) as owner, published curriculum may
 * still live under the authoring account (e.g. dev-user-1). If set, playback retries
 * step resolution with this owner after the request owner finds nothing.
 *
 *   PLAYBACK_CURRICULUM_OWNER_ID=dev-user-1
 *   PLAYBACK_CURRICULUM_OWNER_TYPE=user   (optional, default user)
 */
export function parseCurriculumFallbackOwner(): PlaybackContentOwner | null {
  const ownerId = String(process.env.PLAYBACK_CURRICULUM_OWNER_ID ?? "").trim();
  if (!ownerId) return null;
  const raw = String(process.env.PLAYBACK_CURRICULUM_OWNER_TYPE ?? "user").trim().toLowerCase();
  const ownerType: PlaybackContentOwner["ownerType"] =
    raw === "org" || raw === "school" ? raw : "user";
  return { ownerType, ownerId };
}
