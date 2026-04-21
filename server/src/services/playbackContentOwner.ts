import { findStepRef, getLessonByIdWithinBook } from "../repositories/bookRepository";

export type PlaybackContentOwner = {
  ownerType: "user" | "school" | "org";
  ownerId: string;
};

/**
 * When the game sends Roblox user ids (e.g. -1) as owner, published curriculum may
 * still live under the authoring account (e.g. dev-user-1). If set, Studio retries
 * book/step resolution with this owner **only after** the request owner finds nothing.
 *
 * Render / env:
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

function sameOwner(a: PlaybackContentOwner, b: PlaybackContentOwner) {
  return a.ownerType === b.ownerType && a.ownerId === b.ownerId;
}

export async function findStepRefWithCurriculumFallback(
  requestOwner: PlaybackContentOwner,
  stepId: string
): Promise<{ stepRef: NonNullable<Awaited<ReturnType<typeof findStepRef>>>; contentOwner: PlaybackContentOwner } | null> {
  const trimmed = String(stepId ?? "").trim();
  if (!trimmed) return null;

  const primary = await findStepRef(requestOwner, trimmed);
  if (primary) return { stepRef: primary, contentOwner: requestOwner };

  const fb = parseCurriculumFallbackOwner();
  if (!fb || sameOwner(requestOwner, fb)) return null;

  const secondary = await findStepRef(fb, trimmed);
  if (!secondary) return null;
  return { stepRef: secondary, contentOwner: fb };
}

export async function getLessonRefWithCurriculumFallback(
  requestOwner: PlaybackContentOwner,
  bookId: string,
  lessonId: string
): Promise<{
  lessonRef: NonNullable<Awaited<ReturnType<typeof getLessonByIdWithinBook>>>;
  contentOwner: PlaybackContentOwner;
} | null> {
  const b = String(bookId).trim();
  const l = String(lessonId).trim();
  if (!b || !l) return null;

  let contentOwner = requestOwner;
  let lessonRef = await getLessonByIdWithinBook(requestOwner, b, l);
  if (!lessonRef?.lesson) {
    const fb = parseCurriculumFallbackOwner();
    if (!fb || sameOwner(requestOwner, fb)) return null;
    lessonRef = await getLessonByIdWithinBook(fb, b, l);
    if (!lessonRef?.lesson) return null;
    contentOwner = fb;
  }

  return { lessonRef, contentOwner };
}
