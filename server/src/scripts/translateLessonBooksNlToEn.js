/**
 * translateLessonBooksNlToEn.js
 *
 * For all non-puzzle lesson books: overwrite EN from NL for every localized
 * text field across books, lessons, and steps collections.
 *
 * Flags:
 *   --dry-run          Show what would change without writing
 *   --ownerType=user   (default: user)
 *   --ownerId=...      (default: dev-user-1)
 *   --db=test          Target database (default: test)
 */
require("dotenv/config");
const { MongoClient } = require("mongodb");

function parseFlags() {
  const args = process.argv.slice(2);
  const get = (prefix) => {
    const a = args.find((a) => a.startsWith(prefix));
    return a ? a.slice(prefix.length).trim() : null;
  };
  return {
    ownerType: get("--ownerType=") || "user",
    ownerId: get("--ownerId=") || "dev-user-1",
    db: get("--db=") || "test",
    dryRun: args.includes("--dry-run"),
  };
}

// ── Translation helpers ──────────────────────────────────────────────────────

const PHRASE_MAP = new Map([
  ["Niveau", "Level"],
  ["Examen", "Exam"],
  ["Combineren", "Combinations"],
  ["De Eerste Zet", "The First Move"],
  ["De Tweede Zet", "The Second Move"],
  ["eerste", "first"],
  ["tweede", "second"],
  ["EERSTE", "FIRST"],
  ["TWEEDE", "SECOND"],
  ["VOOR", "FOR"],
  ["Het", "The"],
  ["HET", "THE"],
  ["Geïmporteerde puzzels", "Imported puzzles"],
  ["Elke les is een collectie.", "Each lesson is a collection."],
  ["Slagzet Van De Dag", "Capture of the Day"],
  ["Puzzels", "Puzzles"],
  ["Probeer opnieuw.", "Try again."],
  ["Goed gedaan.", "Correct."],
]);

function normalizeSpace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function phraseMapFallback(text) {
  let out = text;
  for (const [nl, en] of PHRASE_MAP.entries()) out = out.replaceAll(nl, en);
  return out;
}

async function translateViaApi(text) {
  const apiUrl = process.env.TRANSLATE_API_URL;
  if (!apiUrl) return null;
  const payload = { q: text, source: "nl", target: "en", format: "text" };
  const apiKey = process.env.TRANSLATE_API_KEY;
  if (apiKey) payload.api_key = apiKey;
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const t = typeof data?.translatedText === "string" ? data.translatedText.trim() : "";
    return t || null;
  } catch {
    return null;
  }
}

async function translateViaOpenAI(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const endpoint = process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions";
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are a translation engine. Translate exactly and naturally. Return only the translated text, no quotes, no markdown, no explanation.",
          },
          { role: "user", content: `Translate from nl to en:\n${text}` },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === "string" && content.trim() ? content.trim() : null;
  } catch {
    return null;
  }
}

async function translate(text) {
  const trimmed = normalizeSpace(text);
  if (!trimmed) return "";
  const provider = (process.env.TRANSLATE_PROVIDER || "").trim().toLowerCase();
  const apiResult = provider === "openai" ? await translateViaOpenAI(trimmed) : await translateViaApi(trimmed);
  return apiResult || phraseMapFallback(trimmed);
}

// ── Localized field helpers ──────────────────────────────────────────────────

function isNlFilled(value) {
  if (!value || typeof value !== "object" || !value.values) return false;
  const nl = value.values.nl;
  return typeof nl === "string" && nl.trim().length > 0;
}

/**
 * If NL is filled, translate to EN and store it.
 * Returns true if EN was set.
 */
async function fillEnFromNl(localized, stats) {
  if (!isNlFilled(localized)) return false;
  const nl = normalizeSpace(localized.values.nl);
  const en = await translate(nl);
  if (!en) return false;
  const hadApi =
    (process.env.TRANSLATE_API_URL || process.env.OPENAI_API_KEY) &&
    en !== phraseMapFallback(nl);
  localized.values.en = en;
  stats.filled += 1;
  if (hadApi) stats.api += 1;
  else stats.fallback += 1;
  return true;
}

// ── Document field traversal ─────────────────────────────────────────────────

async function translateLocalizedField(doc, key, stats, label) {
  const v = doc[key];
  if (!isNlFilled(v)) return false;
  const changed = await fillEnFromNl(v, stats);
  if (changed) {
    process.stdout.write(`  ${label}.${key}: "${v.values.nl}" → "${v.values.en}"\n`);
  }
  return changed;
}

async function translateMoment(moment, prefix, stats) {
  let changed = false;
  for (const key of ["title", "body", "caption"]) {
    if (isNlFilled(moment[key])) {
      changed = (await fillEnFromNl(moment[key], stats)) || changed;
    }
  }

  const coaches = Array.isArray(moment.coach) ? moment.coach : [];
  for (const coach of coaches) {
    if (coach && isNlFilled(coach.text)) {
      changed = (await fillEnFromNl(coach.text, stats)) || changed;
    }
  }

  const uiItems = Array.isArray(moment.ui) ? moment.ui : [];
  for (const u of uiItems) {
    if (u && (u.type === "showHint" || u.type === "showBanner") && isNlFilled(u.text)) {
      changed = (await fillEnFromNl(u.text, stats)) || changed;
    }
  }

  const ix = moment.interaction;
  if (ix && typeof ix === "object") {
    for (const key of [
      "prompt", "wrongMessage", "successCoachCaption", "wrongCoachCaption",
      "hintMessage", "sequenceHintMessage",
    ]) {
      if (isNlFilled(ix[key])) {
        changed = (await fillEnFromNl(ix[key], stats)) || changed;
      }
    }
    const opts = Array.isArray(ix.options) ? ix.options : [];
    for (const opt of opts) {
      if (opt && isNlFilled(opt.label)) {
        changed = (await fillEnFromNl(opt.label, stats)) || changed;
      }
    }
  }

  return changed;
}

async function translateStep(step, stats) {
  let changed = false;
  if (isNlFilled(step.title)) {
    changed = (await fillEnFromNl(step.title, stats)) || changed;
  }
  const timeline = Array.isArray(step.timeline) ? step.timeline : [];
  for (const moment of timeline) {
    if (!moment || typeof moment !== "object") continue;
    changed = (await translateMoment(moment, "", stats)) || changed;
  }
  return changed;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const { ownerType, ownerId, db, dryRun } = parseFlags();
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error("MONGO_URI missing");

  const client = new MongoClient(mongoUri);
  await client.connect();

  try {
    const database = client.db(db);
    const booksCol = database.collection("books");
    const lessonsCol = database.collection("lessons");
    const stepsCol = database.collection("steps");

    const ownerFilter = { ownerType, ownerId };

    // Non-puzzle books only
    const books = await booksCol
      .find({ ...ownerFilter, isDeleted: { $ne: true }, tags: { $nin: ["puzzels-import"] } })
      .toArray();

    console.log(
      `[translate] db=${db} owner=${ownerType}:${ownerId} dryRun=${dryRun} books=${books.length}`
    );

    const stats = { filled: 0, api: 0, fallback: 0, booksUpdated: 0, lessonsUpdated: 0, stepsUpdated: 0 };

    for (const book of books) {
      const bookId = book.bookId || book.id;
      console.log(`\nBook: ${bookId} | ${book.title?.values?.nl || "(no NL title)"}`);

      // ── Book-level fields ────────────────────────────────────────────────
      let bookChanged = false;
      bookChanged = (await translateLocalizedField(book, "title", stats, "book")) || bookChanged;
      bookChanged = (await translateLocalizedField(book, "description", stats, "book")) || bookChanged;

      if (bookChanged && !dryRun) {
        await booksCol.updateOne(
          { _id: book._id },
          { $set: { title: book.title, description: book.description } }
        );
        stats.booksUpdated += 1;
      }

      // ── Lessons ──────────────────────────────────────────────────────────
      const lessons = await lessonsCol
        .find({ ...ownerFilter, bookId, isDeleted: { $ne: true } })
        .toArray();

      for (const lesson of lessons) {
        const lessonId = lesson.lessonId || lesson.id;
        let lessonChanged = false;
        lessonChanged = (await translateLocalizedField(lesson, "title", stats, `lesson:${lessonId}`)) || lessonChanged;
        lessonChanged = (await translateLocalizedField(lesson, "description", stats, `lesson:${lessonId}`)) || lessonChanged;

        if (lessonChanged && !dryRun) {
          await lessonsCol.updateOne(
            { _id: lesson._id },
            { $set: { title: lesson.title, description: lesson.description } }
          );
          stats.lessonsUpdated += 1;
        }

        // ── Steps ──────────────────────────────────────────────────────────
        const steps = await stepsCol
          .find({ ...ownerFilter, lessonId, isDeleted: { $ne: true } })
          .toArray();

        for (const step of steps) {
          const stepChanged = await translateStep(step, stats);

          if (stepChanged && !dryRun) {
            await stepsCol.updateOne(
              { _id: step._id },
              { $set: { title: step.title, timeline: step.timeline } }
            );
            stats.stepsUpdated += 1;
          }
        }
      }
    }

    console.log("\n── Resultaat ──────────────────────────────────────");
    console.log(`Velden vertaald (EN):    ${stats.filled}`);
    console.log(`Via API:                 ${stats.api}`);
    console.log(`Via phrase fallback:     ${stats.fallback}`);
    console.log(`Books bijgewerkt:        ${stats.booksUpdated}`);
    console.log(`Lessons bijgewerkt:      ${stats.lessonsUpdated}`);
    console.log(`Steps bijgewerkt:        ${stats.stepsUpdated}`);
    if (dryRun) console.log("\n(dry-run — geen wijzigingen opgeslagen)");
  } finally {
    await client.close();
  }
}

run().catch((err) => {
  console.error("[translate] fatal:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
