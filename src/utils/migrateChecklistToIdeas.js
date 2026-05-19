/**
 * migrateDocMemosToIdeas
 *
 * 문맥 패널 하단의 메모영역(DocMemo / MobileMemoTab)이 공모전 보드로 교체되면서,
 * 기존에 사용자가 적어둔 페이지/회차별 메모를 잃지 않게 아이디어 노트로 자동 이전.
 *
 * 메모 저장 키:  localStorage `drama_docMemo_<projectId>_<docKey>`
 *   - DocMemo (RightPanel) 와 MobileMemoTab 이 같은 키 공유
 *   - docKey 예: `ep-<id>`, `script_<id>`, `characters`, `scenelist`, `default` 등
 *
 * - 1회 실행 (localStorage 가드 v2 — 이전 v1 가드는 체크리스트 대상이었으나
 *   잘못 짚었던 작업이므로 무력화. 이 함수는 docMemo 대상만 처리.)
 * - projectId 기준 그룹핑 → 작품별 아이디어 1개
 * - 원본 localStorage 값은 그대로 유지 (다중 기기 동기화 또는 롤백 안전)
 * - 마이그레이션 후에도 docMemo 데이터는 IDE 에서 사라지지만 storage 에는 남아있어
 *   다른 클라이언트가 켰을 때 다시 옮길 수 있다 (가드는 기기별).
 *
 * 호환을 위해 기존 export 이름 그대로 유지.
 */
import { addIdea, newBlock } from '../store/ideasStore';
import { now, genId } from '../store/db';

// v1 = 잘못된 체크리스트 마이그레이션 (사용 안 함, 다시 실행 안 되게 묻어둠)
// v2 = docMemo 마이그레이션 — 실제 사용자 의도
const MIGRATION_FLAG_KEY = 'drama_docmemo_migrated_v2';
const STORAGE_PREFIX = 'drama_docMemo_';

export function hasMigrated() {
  try { return localStorage.getItem(MIGRATION_FLAG_KEY) === '1'; } catch { return false; }
}

function markMigrated() {
  try { localStorage.setItem(MIGRATION_FLAG_KEY, '1'); } catch {}
}

/**
 * 모든 docMemo localStorage 키를 수집.
 * @returns {Array<{ key: string, projectId: string, docKey: string, content: string }>}
 */
function collectDocMemos() {
  if (typeof localStorage === 'undefined') return [];
  const out = [];
  const total = localStorage.length;
  for (let i = 0; i < total; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
    let raw = '';
    try { raw = localStorage.getItem(key) || ''; } catch {}
    if (!raw.trim()) continue;
    const rest = key.slice(STORAGE_PREFIX.length);
    const firstUnderscore = rest.indexOf('_');
    if (firstUnderscore < 0) continue;
    const projectId = rest.slice(0, firstUnderscore);
    const docKey = rest.slice(firstUnderscore + 1);
    out.push({ key, projectId, docKey, content: raw });
  }
  return out;
}

function docKeyLabel(docKey) {
  if (docKey.startsWith('ep-')) return `회차 ${docKey.slice(3, 11)}`;
  if (docKey.startsWith('script_')) return `대본 ${docKey.slice(7, 15)}`;
  return docKey;
}

/**
 * @returns {Promise<{migrated:number, groups:number, skipped:string|null}>}
 */
export async function migrateDocMemosToIdeas(projectNames = null) {
  if (typeof localStorage === 'undefined') {
    return { migrated: 0, groups: 0, skipped: 'no-localStorage' };
  }
  if (hasMigrated()) {
    return { migrated: 0, groups: 0, skipped: 'already-migrated' };
  }

  const memos = collectDocMemos();
  if (memos.length === 0) {
    markMigrated();
    return { migrated: 0, groups: 0, skipped: 'empty' };
  }

  // projectId 그룹핑
  const groups = new Map();
  for (const m of memos) {
    if (!groups.has(m.projectId)) groups.set(m.projectId, []);
    groups.get(m.projectId).push(m);
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  let migratedCount = 0;
  let groupCount = 0;

  for (const [pid, items] of groups) {
    try {
      const blocks = items.map(it => newBlock('memo', {
        content: `[${docKeyLabel(it.docKey)}]\n${it.content.trim()}`,
      }));
      const projName = projectNames && projectNames.get && projectNames.get(pid);
      const suffix = projName ? ` — ${projName}` : ` (작품 ID ${String(pid).slice(0, 8)}…)`;
      const ts = now();
      const idea = {
        id: genId(),
        title: `이전 메모 (자동 이전 ${dateStr})${suffix}`,
        tags: ['이전메모'],
        blocks,
        starred: false,
        createdAt: ts,
        updatedAt: ts,
      };
      await addIdea(idea);
      migratedCount += items.length;
      groupCount++;
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[migrateDocMemosToIdeas] group failed', pid, err);
      }
    }
  }

  markMigrated();
  return { migrated: migratedCount, groups: groupCount, skipped: null };
}

// ─── 호환 alias (App.jsx 가 기존 이름으로 import) ───────────────────────────
export const migrateChecklistItemsToIdeas = migrateDocMemosToIdeas;
