import type { ValidationIssue, ValidationResult } from "./types";
import { resultFromIssues } from "./types";

type LocalizedTextLike = {
  values?: Record<string, unknown>;
};

type LocalizedValidationOptions = {
  requiredLanguages?: string[];
  maxLength?: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLanguageLikeKey(key: string): boolean {
  return /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(key);
}

function normalizeOptions(options?: LocalizedValidationOptions) {
  return {
    requiredLanguages: options?.requiredLanguages ?? ["en"],
    maxLength: options?.maxLength ?? 10000,
  };
}

export function validateLocalizedTextDraft(
  value: unknown,
  path: string,
  options?: LocalizedValidationOptions
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const opts = normalizeOptions(options);

  if (value == null) {
    issues.push({
      path,
      code: "localized.missing",
      message: "Localized text object is missing",
      severity: "warning",
    });
    return resultFromIssues(issues);
  }

  if (!isObject(value)) {
    issues.push({
      path,
      code: "localized.type",
      message: "Localized text must be an object",
      severity: "error",
    });
    return resultFromIssues(issues);
  }

  const localized = value as LocalizedTextLike;
  if (!isObject(localized.values)) {
    issues.push({
      path: `${path}.values`,
      code: "localized.values.type",
      message: "Localized text values must be an object",
      severity: "error",
    });
    return resultFromIssues(issues);
  }

  const entries = Object.entries(localized.values);
  if (entries.length === 0) {
    issues.push({
      path: `${path}.values`,
      code: "localized.values.empty",
      message: "Localized text values object is empty",
      severity: "warning",
    });
  }

  for (const [language, text] of entries) {
    if (!isLanguageLikeKey(language)) {
      issues.push({
        path: `${path}.values.${language}`,
        code: "localized.language.invalid",
        message: `Invalid language key: ${language}`,
        severity: "warning",
      });
    }

    if (typeof text !== "string") {
      issues.push({
        path: `${path}.values.${language}`,
        code: "localized.value.type",
        message: "Localized value must be a string",
        severity: "error",
      });
      continue;
    }

    if (text.length > opts.maxLength) {
      issues.push({
        path: `${path}.values.${language}`,
        code: "localized.value.too_long",
        message: `Localized value exceeds max length ${opts.maxLength}`,
        severity: "warning",
      });
    }
  }

  return resultFromIssues(issues);
}

export function validateLocalizedTextRequired(
  value: unknown,
  path: string,
  options?: LocalizedValidationOptions
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const opts = normalizeOptions(options);
  const draftResult = validateLocalizedTextDraft(value, path, options);
  issues.push(...draftResult.issues);

  if (!isObject(value)) {
    return resultFromIssues(issues);
  }
  const localized = value as LocalizedTextLike;
  if (!isObject(localized.values)) {
    return resultFromIssues(issues);
  }

  for (const language of opts.requiredLanguages) {
    const raw = localized.values[language];
    if (typeof raw !== "string") {
      issues.push({
        path: `${path}.values.${language}`,
        code: "localized.required_language.missing",
        message: `Required language is missing: ${language}`,
        severity: "error",
      });
      continue;
    }

    if (!raw.trim()) {
      issues.push({
        path: `${path}.values.${language}`,
        code: "localized.required_language.empty",
        message: `Required language text is empty: ${language}`,
        severity: "error",
      });
    }
  }

  return resultFromIssues(issues);
}

