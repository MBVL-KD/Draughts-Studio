export function getBookAppId(book: { bookId?: string; id?: string }) {
  return book.bookId ?? book.id ?? "";
}

export function getLessonAppId(lesson: { lessonId?: string; id?: string }) {
  return lesson.lessonId ?? lesson.id ?? "";
}

export function getStepAppId(step: { stepId?: string; id?: string }) {
  return step.stepId ?? step.id ?? "";
}

export function getSourceAppId(source: { sourceId?: string; id?: string }) {
  return source.sourceId ?? source.id ?? "";
}
