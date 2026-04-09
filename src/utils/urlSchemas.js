import { z } from 'zod';

// Prototype Pollution 방지: 위험 키를 가진 레코드를 파싱 단계에서 제거
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const dbRecord = z
  .record(z.string(), z.unknown())
  .transform(obj =>
    Object.fromEntries(
      Object.entries(obj).filter(([k]) => !DANGEROUS_KEYS.has(k))
    )
  );
const dbArray = () => z.array(dbRecord).optional().default([]);

// ── #share= payload (AppContext — 프로젝트 데이터 전체) ───────────────────────
export const sharePayloadSchema = z.object({
  projects:       dbArray(),
  episodes:       dbArray(),
  characters:     dbArray(),
  scenes:         dbArray(),
  scriptBlocks:   dbArray(),
  coverDocs:      dbArray(),
  synopsisDocs:   dbArray(),
  resources:      dbArray(),
  workTimeLogs:   dbArray(),
  checklistItems: dbArray(),
});

// ── #log= payload (App.jsx / App.v2.jsx — 작업 기록 공유) ────────────────────
const logEntrySchema = z.object({
  activeDurationSec: z.number().nonnegative(),
  dateKey:           z.string(),
  completedAt:       z.number(),
  projectId:         z.string(),
}).catchall(z.unknown()); // 미래 필드 허용

export const logShareSchema = z.object({
  type:       z.literal('log-export'),
  logs:       z.array(logEntrySchema).default([]),
  projects:   z.array(dbRecord).optional().default([]),
  exportedAt: z.number().optional(),
});

// ── #review= legacy payload (SharedReviewView — 대본 읽기전용 공유) ───────────
export const reviewLegacySchema = z.object({
  projects:        dbArray(),
  episodes:        dbArray(),
  characters:      dbArray(),
  scenes:          dbArray(),
  scriptBlocks:    dbArray(),
  coverDocs:       dbArray(),
  synopsisDocs:    dbArray(),
  activeProjectId: z.string().optional(),
  stylePreset:     z.record(z.string(), z.unknown()).optional().default({}),
  selections:      z.record(z.string(), z.unknown()).optional(),
});
