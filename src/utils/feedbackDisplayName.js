import { z } from 'zod';

const STORAGE_KEY = 'drama_feedback_display_name';
const MAX_LENGTH = 24;
const CHANGE_EVENT = 'drama_feedback_display_name_changed';

const displayNameSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(1, '표시 이름을 입력해주세요.')
      .max(MAX_LENGTH, `표시 이름은 ${MAX_LENGTH}자 이하로 입력해주세요.`)
  );

export function normalizeFeedbackDisplayName(value) {
  return displayNameSchema.safeParse(value ?? '');
}

export function getStoredFeedbackDisplayName() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = normalizeFeedbackDisplayName(raw ?? '');
    return parsed.success ? parsed.data : '';
  } catch {
    return '';
  }
}

export function saveFeedbackDisplayName(value) {
  const parsed = normalizeFeedbackDisplayName(value);
  if (!parsed.success) return parsed;
  try {
    localStorage.setItem(STORAGE_KEY, parsed.data);
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { value: parsed.data } }));
  } catch {}
  return parsed;
}

export function getFeedbackDisplayNameStorageKey() {
  return STORAGE_KEY;
}

export function getFeedbackDisplayNameChangeEventName() {
  return CHANGE_EVENT;
}

export function getSuggestedFeedbackDisplayName(session) {
  const meta = session?.user?.user_metadata || {};
  const fallback = meta.full_name || meta.name || session?.user?.email?.split('@')[0] || '';
  const parsed = normalizeFeedbackDisplayName(fallback);
  return parsed.success ? parsed.data : '';
}

export function getFeedbackDisplayNameMaxLength() {
  return MAX_LENGTH;
}
