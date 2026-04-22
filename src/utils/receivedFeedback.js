const STORAGE_KEY = 'director_deliveries_received';

function toTimestamp(value) {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIsoString(value) {
  const parsed = new Date(value || Date.now());
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function noteMergeKey(note, fallbackIndex) {
  if (!note) return `fallback:${fallbackIndex}`;
  const sessionKey =
    note.feedback_session_key ||
    note.received_session_id ||
    note.delivery_id ||
    note.submitted_at ||
    note.submittedAt ||
    '';
  const baseKey = note.id || note.block_id || `fallback:${fallbackIndex}`;
  return sessionKey ? `${sessionKey}:${baseKey}` : baseKey;
}

function normalizeNotes(notes, sessionId, deliveryId) {
  if (!Array.isArray(notes)) return [];
  return notes
    .filter(Boolean)
    .map((note, index) => ({
      ...note,
      delivery_id: note.delivery_id || deliveryId || null,
      received_session_id: note.received_session_id || sessionId,
      feedback_session_key:
        note.feedback_session_key ||
        `${sessionId}:${note.id || note.block_id || index}`,
    }));
}

function mergeNotes(existingNotes, incomingNotes) {
  const merged = [...(existingNotes || [])].map((note) => ({ ...note }));
  const indexByKey = new Map();

  merged.forEach((note, index) => {
    indexByKey.set(noteMergeKey(note, index), index);
  });

  (incomingNotes || []).forEach((note, index) => {
    const key = noteMergeKey(note, index);
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, merged.length);
      merged.push({ ...note });
      return;
    }
    merged[existingIndex] = { ...merged[existingIndex], ...note };
  });

  return merged;
}

function deriveSessionMeta(rawSession, notes, fallbackSavedAt, fallbackCreatedAt) {
  const noteWithMeta = notes.find(
    (note) => note?.sender_display_name || note?.senderName || note?.submitted_at || note?.submittedAt
  );

  return {
    senderDisplayName:
      rawSession?.senderDisplayName ||
      rawSession?.sender_display_name ||
      noteWithMeta?.sender_display_name ||
      noteWithMeta?.senderName ||
      '',
    submittedAt: toIsoString(
      rawSession?.submittedAt ||
        rawSession?.submitted_at ||
        noteWithMeta?.submitted_at ||
        noteWithMeta?.submittedAt ||
        fallbackSavedAt ||
        fallbackCreatedAt
    ),
  };
}

function normalizeSession(rawSession, fallbackEntry, entryIndex, sessionIndex) {
  const baseId =
    rawSession?.id ||
    rawSession?.deliveryId ||
    fallbackEntry?.id ||
    `delivery_${entryIndex}_session_${sessionIndex}`;
  const deliveryId = rawSession?.deliveryId || fallbackEntry?.id || baseId;
  const savedAt = toIsoString(rawSession?.savedAt || fallbackEntry?.savedAt);
  const createdAt = toIsoString(rawSession?.createdAt || fallbackEntry?.createdAt || savedAt);
  const notes = normalizeNotes(rawSession?.notes ?? fallbackEntry?.notes, baseId, deliveryId);
  const meta = deriveSessionMeta(rawSession, notes, savedAt, createdAt);

  return {
    id: baseId,
    deliveryId,
    title: rawSession?.title || fallbackEntry?.title || '피드백 노트',
    savedAt,
    createdAt,
    submittedAt: meta.submittedAt,
    senderDisplayName: meta.senderDisplayName,
    appState: rawSession?.appState || fallbackEntry?.appState || null,
    notes,
  };
}

function sortSessionsByRecent(sessions) {
  return [...(sessions || [])].sort((a, b) => toTimestamp(b?.savedAt || b?.submittedAt) - toTimestamp(a?.savedAt || a?.submittedAt));
}

function mergeSessions(existingSessions, incomingSessions) {
  const merged = [...(existingSessions || [])].map((session) => ({ ...session, notes: [...(session.notes || [])] }));
  const indexById = new Map();

  merged.forEach((session, index) => {
    indexById.set(session.deliveryId || session.id, index);
  });

  (incomingSessions || []).forEach((session) => {
    const key = session.deliveryId || session.id;
    const existingIndex = indexById.get(key);
    if (existingIndex === undefined) {
      indexById.set(key, merged.length);
      merged.push({ ...session, notes: [...(session.notes || [])] });
      return;
    }

    const current = merged[existingIndex];
    const keepLatest = toTimestamp(session.savedAt) >= toTimestamp(current.savedAt);
    merged[existingIndex] = {
      ...(keepLatest ? current : session),
      ...(keepLatest ? session : current),
      id: current.id,
      deliveryId: current.deliveryId || session.deliveryId,
      title: (keepLatest ? session.title : current.title) || '피드백 노트',
      createdAt: current.createdAt || session.createdAt,
      savedAt: keepLatest ? session.savedAt : current.savedAt,
      submittedAt: keepLatest ? session.submittedAt : current.submittedAt,
      senderDisplayName:
        (keepLatest ? session.senderDisplayName : current.senderDisplayName) ||
        (keepLatest ? current.senderDisplayName : session.senderDisplayName) ||
        '',
      appState: keepLatest ? (session.appState || current.appState) : (current.appState || session.appState),
      notes: mergeNotes(current.notes, session.notes),
    };
  });

  return sortSessionsByRecent(merged);
}

function buildPage(base, sessions) {
  const sortedSessions = sortSessionsByRecent(sessions);
  const notes = sortedSessions.flatMap((session) =>
    (session.notes || []).map((note) => ({
      ...note,
      received_session_id: note.received_session_id || session.id,
      delivery_id: note.delivery_id || session.deliveryId,
      sender_display_name: note.sender_display_name || session.senderDisplayName || '',
      submitted_at: note.submitted_at || session.submittedAt || '',
    }))
  );

  return {
    id: base.id,
    projectId: base.projectId || null,
    title: base.title || sortedSessions[0]?.title || '피드백 노트',
    savedAt: toIsoString(base.savedAt || sortedSessions[0]?.savedAt),
    createdAt: toIsoString(base.createdAt || sortedSessions[sortedSessions.length - 1]?.createdAt),
    deliveryIds: [...new Set(sortedSessions.map((session) => session.deliveryId).filter(Boolean))],
    sessions: sortedSessions,
    notes,
  };
}

export function normalizeReceivedDeliveries(list) {
  const source = Array.isArray(list) ? list.filter(Boolean) : [];
  const mergedByProject = new Map();
  const standalone = [];

  source.forEach((entry, entryIndex) => {
    const rawSessions =
      Array.isArray(entry.sessions) && entry.sessions.length > 0
        ? entry.sessions
        : [entry];

    const sessions = rawSessions
      .map((session, sessionIndex) => normalizeSession(session, entry, entryIndex, sessionIndex))
      .filter((session) => session.appState || session.notes.length > 0);

    if (sessions.length === 0) return;

    const normalized = buildPage(
      {
        id: entry.id || `delivery_${entryIndex}`,
        projectId: entry.projectId || null,
        title: entry.title || sessions[0]?.title || '피드백 노트',
        savedAt: entry.savedAt || sessions[0]?.savedAt,
        createdAt: entry.createdAt || sessions[sessions.length - 1]?.createdAt,
      },
      sessions
    );

    if (!normalized.projectId) {
      standalone.push(normalized);
      return;
    }

    const current = mergedByProject.get(normalized.projectId);
    if (!current) {
      mergedByProject.set(normalized.projectId, normalized);
      return;
    }

    const keepLatest = toTimestamp(normalized.savedAt) >= toTimestamp(current.savedAt);
    const mergedSessions = mergeSessions(current.sessions, normalized.sessions);
    mergedByProject.set(
      normalized.projectId,
      buildPage(
        {
          ...(keepLatest ? current : normalized),
          ...(keepLatest ? normalized : current),
          id: current.id,
          projectId: current.projectId || normalized.projectId,
          title: (keepLatest ? normalized.title : current.title) || '피드백 노트',
          createdAt: current.createdAt || normalized.createdAt,
          savedAt: keepLatest ? normalized.savedAt : current.savedAt,
        },
        mergedSessions
      )
    );
  });

  return [
    ...Array.from(mergedByProject.values()).sort((a, b) => toTimestamp(b.savedAt) - toTimestamp(a.savedAt)),
    ...standalone.sort((a, b) => toTimestamp(b.savedAt) - toTimestamp(a.savedAt)),
  ];
}

export function getReceivedDeliveries() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const normalized = normalizeReceivedDeliveries(raw);
    if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    return [];
  }
}

export function saveReceivedDeliveries(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeReceivedDeliveries(list)));
}

export function containsReceivedDeliveryId(list, deliveryId) {
  return normalizeReceivedDeliveries(list).some(
    (entry) =>
      entry.id === deliveryId ||
      (entry.deliveryIds || []).includes(deliveryId) ||
      (entry.sessions || []).some(
        (session) => session.id === deliveryId || session.deliveryId === deliveryId
      )
  );
}

export function getReceivedDeliveryStorageKey() {
  return STORAGE_KEY;
}
