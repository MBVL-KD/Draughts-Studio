export type ValidationSeverity = "error" | "warning";

export type ValidationIssue = {
  path: string;
  code: string;
  message: string;
  severity: ValidationSeverity;
};

export type ValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
};

export function okResult(): ValidationResult {
  return { ok: true, issues: [] };
}

export function resultFromIssues(issues: ValidationIssue[]): ValidationResult {
  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}

export function mergeValidationResults(...results: ValidationResult[]): ValidationResult {
  const issues = results.flatMap((result) => result.issues);
  return resultFromIssues(issues);
}
