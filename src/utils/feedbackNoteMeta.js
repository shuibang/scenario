export function getFeedbackNoteSender(note) {
  return note?.sender_display_name || note?.senderName || '';
}

export function getFeedbackNoteSubmittedAt(note) {
  return note?.submitted_at || note?.submittedAt || note?.created_at || note?.createdAt || '';
}

export function formatFeedbackNoteTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}.${lookup.month}.${lookup.day} ${lookup.hour}:${lookup.minute}`;
}

export function buildFeedbackNoteMeta(note) {
  const sender = getFeedbackNoteSender(note);
  const submittedAt = formatFeedbackNoteTimestamp(getFeedbackNoteSubmittedAt(note));
  return [sender, submittedAt].filter(Boolean).join(' · ');
}
