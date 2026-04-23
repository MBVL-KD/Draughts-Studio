const mongoose = require("mongoose");
const connectMongo = require("../config/mongo");
const fs = require("fs");
const path = require("path");

const LOCALIZED_FIELD_PATHS = [
  "title",
  "description",
  "lessons.*.title",
  "lessons.*.description",
  "lessons.*.steps.*.title",
  "lessons.*.steps.*.prompt",
  "lessons.*.steps.*.hint",
  "lessons.*.steps.*.explanation",
  "lessons.*.steps.*.feedback.correct",
  "lessons.*.steps.*.feedback.incorrect",
  "lessons.*.steps.*.presentation.npc.text",
  "lessons.*.authoringV2.authoringLesson.title",
  "lessons.*.authoringV2.authoringLesson.description",
];

const PHRASE_MAP_NL_TO_EN = new Map([
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

const PHRASE_MAP_EN_TO_NL = new Map([
  ["Level", "Niveau"],
  ["Exam", "Examen"],
  ["Combinations", "Combineren"],
  ["The First Move", "De Eerste Zet"],
  ["The Second Move", "De Tweede Zet"],
  ["FIRST", "EERSTE"],
  ["SECOND", "TWEEDE"],
  ["FOR", "VOOR"],
  ["Puzzles", "Puzzels"],
  ["Capture of the Day", "Slagzet van de dag"],
  ["Try again.", "Probeer opnieuw."],
  ["Correct.", "Goed gedaan."],
]);

function getNestedValue(obj, dottedPath) {
  const parts = dottedPath.split(".");
  let current = obj;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

function setNestedValue(obj, dottedPath, value) {
  const parts = dottedPath.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (!current[part] || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

function expandWildcards(root, wildcardPath) {
  const parts = wildcardPath.split(".");
  const paths = [];

  function walk(node, idx, currentPath) {
    if (idx >= parts.length) {
      paths.push(currentPath.join("."));
      return;
    }
    const part = parts[idx];
    if (part === "*") {
      if (!Array.isArray(node)) return;
      for (let i = 0; i < node.length; i += 1) {
        walk(node[i], idx + 1, [...currentPath, String(i)]);
      }
      return;
    }
    if (!node || typeof node !== "object" || !(part in node)) return;
    walk(node[part], idx + 1, [...currentPath, part]);
  }

  walk(root, 0, []);
  return paths;
}

function applyPhraseMap(text, phraseMap) {
  let out = text;
  for (const [source, target] of phraseMap.entries()) {
    out = out.replaceAll(source, target);
  }
  return out;
}

function normalizeSpace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function smartTranslate(text, direction) {
  const trimmed = normalizeSpace(text);
  if (!trimmed) return "";
  if (direction === "nlToEn") return applyPhraseMap(trimmed, PHRASE_MAP_NL_TO_EN);
  return applyPhraseMap(trimmed, PHRASE_MAP_EN_TO_NL);
}

async function translateViaApi(text, sourceLang, targetLang) {
  const apiUrl = process.env.TRANSLATE_API_URL;
  if (!apiUrl) return null;
  const payload = {
    q: text,
    source: sourceLang,
    target: targetLang,
    format: "text",
  };
  const apiKey = process.env.TRANSLATE_API_KEY;
  if (apiKey) payload.api_key = apiKey;
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const translated = typeof data?.translatedText === "string" ? data.translatedText.trim() : "";
    return translated || null;
  } catch (_error) {
    return null;
  }
}

async function translateViaOpenAI(text, sourceLang, targetLang) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const endpoint = process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions";
  const systemPrompt =
    "You are a translation engine. Translate exactly and naturally. Return only the translated text, no quotes, no markdown, no explanation.";
  const userPrompt = `Translate from ${sourceLang} to ${targetLang}:\n${text}`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim()) return content.trim();
    return null;
  } catch (_error) {
    return null;
  }
}

async function translateViaProvider(text, sourceLang, targetLang) {
  const provider = (process.env.TRANSLATE_PROVIDER || "").trim().toLowerCase();
  if (provider === "openai") return translateViaOpenAI(text, sourceLang, targetLang);
  return translateViaApi(text, sourceLang, targetLang);
}

function ensureLocalizedObject(value) {
  if (value && typeof value === "object" && value.values && typeof value.values === "object") {
    return { values: { ...value.values } };
  }
  return { values: {} };
}

function isBlank(value) {
  return typeof value !== "string" || value.trim().length === 0;
}

async function tryTranslateMissingPair(localized, context) {
  const en = typeof localized.values.en === "string" ? localized.values.en : "";
  const nl = typeof localized.values.nl === "string" ? localized.values.nl : "";
  let changed = false;
  let filledEn = 0;
  let filledNl = 0;
  let apiTranslated = 0;
  let fallbackTranslated = 0;
  const entries = [];

  if (isBlank(en) && !isBlank(nl)) {
    const from = normalizeSpace(nl);
    const apiText = await translateViaProvider(from, "nl", "en");
    localized.values.en = apiText || smartTranslate(from, "nlToEn");
    changed = true;
    filledEn = 1;
    if (apiText) apiTranslated = 1;
    else fallbackTranslated = 1;
    entries.push({
      ...context,
      fromLanguage: "nl",
      toLanguage: "en",
      fromText: from,
      toText: localized.values.en,
      via: apiText ? "api" : "fallback",
    });
  }

  if (isBlank(nl) && !isBlank(en)) {
    const from = normalizeSpace(en);
    const apiText = await translateViaProvider(from, "en", "nl");
    localized.values.nl = apiText || smartTranslate(from, "enToNl");
    changed = true;
    filledNl = 1;
    if (apiText) apiTranslated += 1;
    else fallbackTranslated += 1;
    entries.push({
      ...context,
      fromLanguage: "en",
      toLanguage: "nl",
      fromText: from,
      toText: localized.values.nl,
      via: apiText ? "api" : "fallback",
    });
  }

  return { changed, filledEn, filledNl, apiTranslated, fallbackTranslated, entries };
}

async function run() {
  const dryRun = process.argv.includes("--dry-run");
  await connectMongo();
  const collection = mongoose.connection.collection("books");
  const books = await collection.find({}).toArray();

  let scannedFields = 0;
  let updatedBooks = 0;
  let filledEnCount = 0;
  let filledNlCount = 0;
  let apiTranslatedCount = 0;
  let fallbackTranslatedCount = 0;
  const report = [];

  for (const book of books) {
    let changed = false;
    const workingBook = JSON.parse(JSON.stringify(book));

    for (const wildcardPath of LOCALIZED_FIELD_PATHS) {
      const concretePaths = expandWildcards(workingBook, wildcardPath);
      for (const path of concretePaths) {
        const existing = getNestedValue(workingBook, path);
        if (!existing) continue;

        const localized = ensureLocalizedObject(existing);
        scannedFields += 1;
        const translated = await tryTranslateMissingPair(localized, { bookId: book.bookId, path });
        if (translated.changed) {
          changed = true;
          filledEnCount += translated.filledEn;
          filledNlCount += translated.filledNl;
          apiTranslatedCount += translated.apiTranslated;
          fallbackTranslatedCount += translated.fallbackTranslated;
          report.push(...translated.entries);
          setNestedValue(workingBook, path, localized);
        }
      }
    }

    const lessons = Array.isArray(workingBook.lessons) ? workingBook.lessons : [];
    for (let lessonIndex = 0; lessonIndex < lessons.length; lessonIndex += 1) {
      const lesson = lessons[lessonIndex];
      const authoring = lesson?.authoringV2;
      const stepsById =
        authoring && typeof authoring === "object" && authoring.stepsById && typeof authoring.stepsById === "object"
          ? authoring.stepsById
          : null;
      if (!stepsById) continue;
      for (const [authoringStepId, authoringStep] of Object.entries(stepsById)) {
        const stepTitleField = authoringStep?.title;
        if (
          stepTitleField &&
          typeof stepTitleField === "object" &&
          stepTitleField.values &&
          typeof stepTitleField.values === "object"
        ) {
          const localized = ensureLocalizedObject(stepTitleField);
          scannedFields += 1;
          const translated = await tryTranslateMissingPair(localized, {
            bookId: book.bookId,
            path: `lessons.${lessonIndex}.authoringV2.stepsById.${authoringStepId}.title`,
          });
          if (translated.changed) {
            changed = true;
            filledEnCount += translated.filledEn;
            filledNlCount += translated.filledNl;
            apiTranslatedCount += translated.apiTranslated;
            fallbackTranslatedCount += translated.fallbackTranslated;
            report.push(...translated.entries);
            authoringStep.title = localized;
          }
        }

        const timeline = Array.isArray(authoringStep?.timeline) ? authoringStep.timeline : [];
        for (let momentIndex = 0; momentIndex < timeline.length; momentIndex += 1) {
          const moment = timeline[momentIndex];
          if (!moment || typeof moment !== "object") continue;
          const momentType = typeof moment.type === "string" ? moment.type : "unknown";
          const momentFields = [
            { key: "title", value: moment.title },
            { key: "body", value: moment.body },
            { key: "caption", value: moment.caption },
          ];
          for (const field of momentFields) {
            const localized = ensureLocalizedObject(field.value);
            const hasValues = field.value && typeof field.value === "object" && field.value.values;
            if (!hasValues) continue;
            scannedFields += 1;
            const translated = await tryTranslateMissingPair(localized, {
              bookId: book.bookId,
              path: `lessons.${lessonIndex}.authoringV2.stepsById.${authoringStepId}.timeline.${momentIndex}.${field.key}`,
            });
            if (!translated.changed) continue;
            changed = true;
            filledEnCount += translated.filledEn;
            filledNlCount += translated.filledNl;
            apiTranslatedCount += translated.apiTranslated;
            fallbackTranslatedCount += translated.fallbackTranslated;
            report.push(...translated.entries.map((entry) => ({ ...entry, momentType })));
            moment[field.key] = localized;
          }

          const coaches = Array.isArray(moment.coach) ? moment.coach : [];
          for (let coachIndex = 0; coachIndex < coaches.length; coachIndex += 1) {
            const coach = coaches[coachIndex];
            if (!coach || typeof coach !== "object" || !coach.text) continue;
            const localized = ensureLocalizedObject(coach.text);
            scannedFields += 1;
            const translated = await tryTranslateMissingPair(localized, {
              bookId: book.bookId,
              path: `lessons.${lessonIndex}.authoringV2.stepsById.${authoringStepId}.timeline.${momentIndex}.coach.${coachIndex}.text`,
            });
            if (!translated.changed) continue;
            changed = true;
            filledEnCount += translated.filledEn;
            filledNlCount += translated.filledNl;
            apiTranslatedCount += translated.apiTranslated;
            fallbackTranslatedCount += translated.fallbackTranslated;
            report.push(...translated.entries.map((entry) => ({ ...entry, momentType })));
            coach.text = localized;
          }
        }
      }
    }

    if (changed && !dryRun) {
      await collection.updateOne(
        { _id: book._id },
        {
          $set: {
            title: workingBook.title,
            description: workingBook.description,
            lessons: workingBook.lessons,
          },
        }
      );
      updatedBooks += 1;
    }
  }

  const reportsDir = path.join(__dirname, "../../../reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(
    reportsDir,
    `auto-translate-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        booksScanned: books.length,
        updatedBooks,
        scannedFields,
        filledEnCount,
        filledNlCount,
        apiTranslatedCount,
        fallbackTranslatedCount,
        dryRun,
        reportPath,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (error) => {
  console.error("autoTranslateMissingLocalizedTexts failed:", error);
  try {
    await mongoose.disconnect();
  } catch (_err) {
    // ignore
  }
  process.exit(1);
});
