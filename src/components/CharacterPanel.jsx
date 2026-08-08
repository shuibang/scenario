import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../store/AppContext';
import { genId, now } from '../store/db';
import {
  findMatches, replaceInSelectedBlocks,
  findInSynopsisDoc, replaceInSynopsisDoc,
  findInCharacterIntro, replaceInCharacterIntro,
  findInEpisodeSummary, replaceInEpisodeSummary,
  findInCoverDoc, replaceInCoverDoc,
} from '../utils/findReplace';
import { generateRenamePairs } from '../utils/characterRename';
import { buildCharacterPhoto, hasPhoto, photoErrorMessage } from '../utils/characterPhoto';
import RenameConfirmDialog from './Modals/RenameConfirmDialog';
import RolePicker from './RolePicker';
import RenamePreviewDialog from './Modals/RenamePreviewDialog';

// ─── 페어별 검색 결과 그룹핑 헬퍼 ────────────────────────────────────────────
function buildPairResult(pair, pairIdx, { projectBlocks, synopsisDoc, projectChars, projectEpisodes, coverDoc, scope, opts }) {
  // 1. 대본 블록
  const allBlockMatches = findMatches(projectBlocks, pair.oldText, { ...opts, searchScope: pair.searchScope });
  const blockMap = new Map();
  allBlockMatches.forEach(m => {
    if (!blockMap.has(m.blockId)) {
      blockMap.set(m.blockId, { blockId: m.blockId, blockType: m.blockType, count: 1, contexts: [m.context], hasCharName: m.matchField === 'charName' });
    } else {
      const g = blockMap.get(m.blockId);
      g.count++;
      g.contexts.push(m.context);
      if (m.matchField === 'charName') g.hasCharName = true;
    }
  });
  let blockGroups = Array.from(blockMap.values());
  if (scope === 'character') {
    blockGroups = blockGroups.filter(g => g.hasCharName);
  } else if (scope === 'character_dialogue') {
    blockGroups = blockGroups.filter(g => g.hasCharName || g.blockType === 'dialogue');
  }

  // 2. 시놉시스 (scope=all에서만)
  const synopsisGroups = [];
  if (scope === 'all' && synopsisDoc) {
    const sm = new Map();
    findInSynopsisDoc(synopsisDoc, pair.oldText, opts).forEach(m => {
      if (!sm.has(m.field)) sm.set(m.field, { field: m.field, fieldLabel: m.fieldLabel, count: 1, contexts: [m.context] });
      else { const g = sm.get(m.field); g.count++; g.contexts.push(m.context); }
    });
    synopsisGroups.push(...sm.values());
  }

  // 3. 인물 소개 (scope=all에서만)
  const charIntroGroups = [];
  if (scope === 'all') {
    projectChars.forEach(char => {
      const ms = findInCharacterIntro(char, pair.oldText, opts);
      if (ms.length > 0) charIntroGroups.push({ charId: char.id, charName: char.givenName || char.name || '', count: ms.length, contexts: ms.map(m => m.context) });
    });
  }

  // 4. 에피소드 트리트먼트 (scope=all에서만)
  const episodeGroups = [];
  if (scope === 'all') {
    projectEpisodes.forEach(ep => {
      const ms = findInEpisodeSummary(ep, pair.oldText, opts);
      if (ms.length > 0) {
        const itemIds = [...new Set(ms.map(m => m.itemId))];
        episodeGroups.push({ episodeId: ep.id, epNum: ep.number, epTitle: ep.title || '', itemIds, count: ms.length, contexts: ms.map(m => m.context).slice(0, 3) });
      }
    });
  }

  // 5. 표지 (scope=all에서만)
  const coverGroups = [];
  const coverCustomGroups = [];
  if (scope === 'all' && coverDoc) {
    const fm = new Map(), cm = new Map();
    findInCoverDoc(coverDoc, pair.oldText, opts).forEach(m => {
      if (m.source === 'coverDoc') {
        if (!fm.has(m.field)) fm.set(m.field, { field: m.field, fieldLabel: m.fieldLabel, count: 1, contexts: [m.context] });
        else { const g = fm.get(m.field); g.count++; g.contexts.push(m.context); }
      } else {
        if (!cm.has(m.fieldId)) cm.set(m.fieldId, { fieldId: m.fieldId, fieldLabel: m.fieldLabel, count: 1, contexts: [m.context] });
        else { const g = cm.get(m.fieldId); g.count++; g.contexts.push(m.context); }
      }
    });
    coverGroups.push(...fm.values());
    coverCustomGroups.push(...cm.values());
  }

  const hasAny = blockGroups.length || synopsisGroups.length || charIntroGroups.length || episodeGroups.length || coverGroups.length || coverCustomGroups.length;
  if (!hasAny) return null;

  return { pairIdx, label: pair.label, oldText: pair.oldText, newText: pair.newText, searchScope: pair.searchScope, blockGroups, synopsisGroups, charIntroGroups, episodeGroups, coverGroups, coverCustomGroups };
}

// ─── 서사 역할 카탈로그 (다중 선택) ──────────────────────────────────────────
// 카테고리 + 색상별로 정리. 한 인물은 여러 역할을 동시에 가질 수 있다.
// 옛 단일 키('lead'/'support'/'extra' + 1차 단일키들)는 ROLE_LEGACY_MIGRATE 로 매핑.
const ROLE_CATEGORIES = [
  {
    id: 'protagonist',
    label: '주인공 계열',
    color: 'var(--c-accent)',
    items: [
      { value: 'protagonist',          label: '주인공' },
      { value: 'hero',                 label: '히어로' },
      { value: 'antihero',             label: '안티히어로' },
      { value: 'anti_protagonist',     label: '반주인공' },
      { value: 'deuteragonist',        label: '공동주인공' },
      { value: 'narrator_observer',    label: '관찰자 화자' },
      { value: 'growth_protagonist',   label: '성장형 주인공' },
      { value: 'tragic_protagonist',   label: '비극적 주인공' },
    ],
  },
  {
    id: 'opposition',
    label: '대립 계열',
    color: '#dc2626',
    items: [
      { value: 'antagonist',     label: '적대자' },
      { value: 'villain',        label: '빌런' },
      { value: 'rival',          label: '라이벌' },
      { value: 'competitor',     label: '경쟁자' },
      { value: 'mastermind',     label: '흑막' },
      { value: 'final_boss',     label: '최종보스' },
      { value: 'traitor',        label: '배신자' },
      { value: 'internal_enemy', label: '내부 적' },
      { value: 'false_ally',     label: '거짓 조력자' },
      { value: 'foil',           label: '반동인물' },
    ],
  },
  {
    id: 'helper',
    label: '조력 계열',
    color: '#16a34a',
    items: [
      { value: 'ally',       label: '조력자' },
      { value: 'mentor',     label: '멘토' },
      { value: 'teacher',    label: '스승' },
      { value: 'partner',    label: '파트너' },
      { value: 'companion',  label: '동료' },
      { value: 'sidekick',   label: '사이드킥' },
      { value: 'patron',     label: '후원자' },
      { value: 'savior',     label: '구원자' },
      { value: 'informant',  label: '정보 제공자' },
      { value: 'mediator',   label: '중재자' },
    ],
  },
  {
    id: 'relational',
    label: '감정·관계 역할',
    color: '#ec4899',
    items: [
      { value: 'love',             label: '러브인터레스트' },
      { value: 'family_protector', label: '가족 보호자' },
      { value: 'protectee',        label: '보호 대상' },
      { value: 'victim',           label: '희생자' },
      { value: 'revenge_target',   label: '복수 대상' },
      { value: 'salvation_target', label: '구원 대상' },
      { value: 'friend',           label: '친구' },
      { value: 'crush',            label: '썸 상대' },
      { value: 'ex_lover',         label: '전 연인' },
      { value: 'destined',         label: '운명적 상대' },
      { value: 'family',           label: '가족' },
    ],
  },
  {
    id: 'trigger',
    label: '사건 유발',
    color: '#0891b2',
    items: [
      { value: 'inciter',         label: '촉발자' },
      { value: 'client',          label: '의뢰인' },
      { value: 'messenger',       label: '메신저' },
      { value: 'event_provider',  label: '사건 제공자' },
      { value: 'scapegoat',       label: '희생양' },
      { value: 'survivor',        label: '생존자' },
    ],
  },
  {
    id: 'tension',
    label: '긴장 조성',
    color: '#ea580c',
    items: [
      { value: 'troublemaker', label: '트러블메이커' },
      { value: 'obstructor',   label: '방해자' },
      { value: 'tempter',      label: '유혹자' },
      { value: 'instigator',   label: '선동가' },
      { value: 'watcher',      label: '감시자' },
      { value: 'judge',        label: '심판자' },
      { value: 'negotiator',   label: '협상자' },
    ],
  },
  {
    id: 'worldbuilding',
    label: '세계관 설명',
    color: '#8b5cf6',
    items: [
      { value: 'explainer', label: '해설자' },
      { value: 'narrator',  label: '화자' },
      { value: 'observer',  label: '관찰자' },
      { value: 'guide',     label: '안내자' },
      { value: 'briefer',   label: '정보 브리핑' },
    ],
  },
  {
    id: 'misc',
    label: '기타',
    color: '#f59e0b',
    items: [
      { value: 'comic', label: '감초' },
      { value: 'other', label: '기타' },
    ],
  },
];

// 평탄화된 옵션·라벨·색상 맵
const ALL_ROLE_OPTIONS = ROLE_CATEGORIES.flatMap((cat) =>
  cat.items.map((it) => ({ ...it, categoryId: cat.id, color: cat.color }))
);
const ROLE_LABELS = Object.fromEntries(ALL_ROLE_OPTIONS.map((o) => [o.value, o.label]));
const ROLE_COLORS = Object.fromEntries(ALL_ROLE_OPTIONS.map((o) => [o.value, o.color]));

// 호환: 단일-선택 시기 (1차 9개) 변수 유지 — 일부 외부 의존성 보존
const ROLE_OPTIONS = [
  { value: '', label: '— 미지정 —', color: 'var(--c-text6)' },
  ...ALL_ROLE_OPTIONS,
];

// 옛 키 → 새 키 매핑
const ROLE_LEGACY_MIGRATE = {
  // v1: 비중 라벨
  lead:    'protagonist',
  support: 'other',
  extra:   'other',
  // 그 외 1차 단일키들은 그대로 새 카탈로그에 존재해서 매핑 불필요.
};

// 옛 키 → 새 키 정규화. null/undefined/'' 는 공란.
function normalizeRole(role) {
  if (role == null || role === '') return '';
  if (ROLE_LEGACY_MIGRATE[role]) return ROLE_LEGACY_MIGRATE[role];
  return role;
}

/**
 * 캐릭터에서 역할 배열을 추출.
 * 우선순위: char.roles (다중) > char.role (단일, 옛 데이터)
 * 모든 항목에 normalizeRole 적용.
 */
export function getCharRoles(char) {
  if (!char) return [];
  if (Array.isArray(char.roles) && char.roles.length > 0) {
    return char.roles.map(normalizeRole).filter(Boolean);
  }
  if (char.role) {
    const r = normalizeRole(char.role);
    return r ? [r] : [];
  }
  return [];
}

// 공란이면 빈 문자열을 돌려줌 — 칩이 비어 보이도록.
export function getRoleLabel(role) {
  const k = normalizeRole(role);
  if (k === '') return '';
  return ROLE_LABELS[k] || '';
}
export function getRoleColor(role) {
  const k = normalizeRole(role);
  return ROLE_COLORS[k] || 'var(--c-text5)';
}
export { ROLE_CATEGORIES, ROLE_OPTIONS, ALL_ROLE_OPTIONS, normalizeRole };

// ─── Compat helpers ────────────────────────────────────────────────────────────
export function charDisplayName(char) {
  return char.givenName || char.name || '';
}
export function charFullName(char) {
  if (char.surname || char.givenName) {
    return [char.surname, char.givenName].filter(Boolean).join('');
  }
  return char.name || '';
}
function charOccupation(char) { return char.occupation ?? char.job ?? ''; }
function charIntro(char) { return char.intro ?? char.description ?? ''; }
function charExtraFields(char) { return char.extraFields ?? char.customFields ?? []; }

// ─── Migrate existing char → form initial values ───────────────────────────────
function charToForm(char) {
  if (char) {
    return {
      surname:     char.surname     ?? '',
      givenName:   char.givenName   ?? char.name ?? '',
      gender:      char.gender      ?? '',
      age:         char.age         ?? '',
      occupation:  charOccupation(char),
      roles:       getCharRoles(char),
      intro:       charIntro(char),
      extraFields: charExtraFields(char),
    };
  }
  return { surname: '', givenName: '', gender: '', age: '', occupation: '', roles: [], intro: '', extraFields: [] };
}

// ─── CharacterForm ─────────────────────────────────────────────────────────────
function CharacterForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(() => charToForm(initial));
  const f = (field, val) => setForm(p => ({ ...p, [field]: val }));

  const addExtraField = () => {
    setForm(p => ({ ...p, extraFields: [...(p.extraFields || []), { id: genId(), label: '항목명', value: '' }] }));
  };
  const updateExtra = (id, key, val) => {
    setForm(p => ({ ...p, extraFields: (p.extraFields || []).map(cf => cf.id === id ? { ...cf, [key]: val } : cf) }));
  };
  const removeExtra = (id) => {
    setForm(p => ({ ...p, extraFields: (p.extraFields || []).filter(cf => cf.id !== id) }));
  };

  const inputStyle = {
    background: 'var(--c-input)',
    color: 'var(--c-text)',
    border: '1px solid var(--c-border3)',
    borderRadius: '0.375rem',
    outline: 'none',
    width: '100%',
    fontSize: '0.875rem',
    padding: '0.375rem 0.75rem',
  };

  const canSave = form.givenName.trim() || form.surname.trim();

  const handleSave = () => {
    if (!canSave) return;
    const fullName = [form.surname, form.givenName].filter(Boolean).join('') || form.givenName;
    // role(단일) 필드는 더 이상 사용하지 않음 — roles[]만 저장.
    const { role: _legacy, ...rest } = form;
    onSave({ ...rest, name: fullName });
  };

  return (
    <div className="rounded-lg p-4 space-y-3" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] mb-1 uppercase tracking-wider" style={{ color: 'var(--c-text5)' }}>성</label>
          <input value={form.surname} onChange={e => f('surname', e.target.value)}
            onKeyDown={e => e.key === 'Escape' && onCancel()} style={inputStyle} placeholder="홍" />
        </div>
        <div>
          <label className="block text-[10px] mb-1 uppercase tracking-wider" style={{ color: 'var(--c-text5)' }}>이름 / 호칭 *</label>
          <input autoFocus value={form.givenName} onChange={e => f('givenName', e.target.value)}
            onKeyDown={e => e.key === 'Escape' && onCancel()} style={inputStyle} placeholder="길동" />
        </div>
      </div>
      <div>
        <label className="block text-[10px] mb-1 uppercase tracking-wider" style={{ color: 'var(--c-text5)' }}>서사 역할 (다중 선택)</label>
        <RolePicker
          value={form.roles || []}
          onChange={(next) => f('roles', next)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] mb-1 uppercase tracking-wider" style={{ color: 'var(--c-text5)' }}>성별</label>
          <input value={form.gender} onChange={e => f('gender', e.target.value)} style={inputStyle} placeholder="남 / 여" />
        </div>
        <div>
          <label className="block text-[10px] mb-1 uppercase tracking-wider" style={{ color: 'var(--c-text5)' }}>나이</label>
          <input value={form.age} onChange={e => f('age', e.target.value)} style={inputStyle} placeholder="30대 초반 / 32" />
        </div>
      </div>
      <div>
        <label className="block text-[10px] mb-1 uppercase tracking-wider" style={{ color: 'var(--c-text5)' }}>직업</label>
        <input value={form.occupation} onChange={e => f('occupation', e.target.value)} style={inputStyle} placeholder="형사 / 배우 / 학생" />
      </div>
      <div>
        <label className="block text-[10px] mb-1 uppercase tracking-wider" style={{ color: 'var(--c-text5)' }}>인물소개</label>
        <textarea value={form.intro} onChange={e => f('intro', e.target.value)}
          rows={3} style={{ ...inputStyle, resize: 'none' }} placeholder="성격, 배경, 특징 등" />
      </div>

      {(form.extraFields || []).map(cf => (
        <div key={cf.id} className="flex gap-2 items-start">
          <div className="flex-1 space-y-1">
            <input value={cf.label} onChange={e => updateExtra(cf.id, 'label', e.target.value)}
              className="text-[10px] bg-transparent outline-none" style={{ color: 'var(--c-text5)', borderBottom: '1px solid var(--c-border3)', width: '100%' }} />
            <input value={cf.value} onChange={e => updateExtra(cf.id, 'value', e.target.value)} style={{ ...inputStyle, fontSize: '0.8rem' }} placeholder="내용" />
          </div>
          <button onClick={() => removeExtra(cf.id)} className="mt-5 w-6 h-6 rounded text-sm flex items-center justify-center shrink-0"
            style={{ color: 'var(--c-text5)', border: '1px solid var(--c-border3)', background: 'transparent' }}>−</button>
        </div>
      ))}
      <button onClick={addExtraField} className="w-full py-1.5 rounded text-xs"
        style={{ color: 'var(--c-text4)', border: '1px dashed var(--c-border3)', background: 'transparent', cursor: 'pointer' }}>
        + 추가 항목
      </button>

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm rounded" style={{ color: 'var(--c-text4)', border: '1px solid var(--c-border3)', background: 'transparent' }}>취소</button>
        <button onClick={handleSave} disabled={!canSave}
          className="px-3 py-1.5 text-sm rounded text-white"
          style={{ background: 'var(--c-accent)', opacity: canSave ? 1 : 0.4, cursor: canSave ? 'pointer' : 'not-allowed' }}>저장</button>
      </div>
    </div>
  );
}

// ─── CharacterUsage ────────────────────────────────────────────────────────────
function CharacterUsage({ char, episodes, scenes, scriptBlocks }) {
  const name = charDisplayName(char);
  const fullName = charFullName(char);

  // Dialogue blocks for this character (characterId primary, charName text fallback)
  const dialogueBlocks = scriptBlocks.filter(b => {
    if (b.type !== 'dialogue') return false;
    if (b.characterId && b.characterId === char.id) return true;
    if (!b.characterId && b.charName && (b.charName === name || b.charName === fullName)) return true;
    return false;
  });

  // Scene number blocks (for label lookup)
  const sceneNumberBlocks = scriptBlocks.filter(b => b.type === 'scene_number');

  // Scenes where character appears via characterIds
  const appearedScenes = scenes.filter(s => (s.characterIds || []).includes(char.id));

  // Build dialogue list: group by episode
  const dialoguesByEp = {};
  for (const b of dialogueBlocks) {
    const epId = b.episodeId || '__none__';
    if (!dialoguesByEp[epId]) dialoguesByEp[epId] = [];
    dialoguesByEp[epId].push(b);
  }

  const epMap = {};
  for (const ep of episodes) epMap[ep.id] = ep;

  const sceneBlockMap = {};
  for (const b of sceneNumberBlocks) {
    if (b.sceneId) sceneBlockMap[b.sceneId] = b;
  }

  const sceneObjMap = {};
  for (const s of scenes) sceneObjMap[s.id] = s;

  const hasDialogues = dialogueBlocks.length > 0;
  const hasScenes = appearedScenes.length > 0;

  if (!hasDialogues && !hasScenes) {
    return (
      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--c-border)' }}>
        <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--c-text6)' }}>인물 현황</div>
        <div className="text-[10px]" style={{ color: 'var(--c-text6)' }}>등장 기록 없음</div>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 space-y-4" style={{ borderTop: '1px solid var(--c-border)' }}>
      <div className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--c-text6)' }}>인물 현황</div>

      {/* Dialogues */}
      {hasDialogues && (
        <div>
          <div className="text-xs font-medium mb-2" style={{ color: 'var(--c-text4)' }}>
            대사 <span style={{ color: 'var(--c-accent)' }}>{dialogueBlocks.length}</span>개
          </div>
          <div className="space-y-3">
            {Object.entries(dialoguesByEp).map(([epId, blocks]) => {
              const ep = epId !== '__none__' ? epMap[epId] : null;
              return (
                <div key={epId}>
                  {ep && (
                    <div className="text-[10px] mb-1 font-medium" style={{ color: 'var(--c-accent2)' }}>
                      {ep.number}회{ep.title ? ' ' + ep.title : ''}
                    </div>
                  )}
                  <div className="space-y-1">
                    {blocks.map(b => {
                      const sceneBlock = b.sceneId ? sceneBlockMap[b.sceneId] : null;
                      const sceneLabel = sceneBlock
                        ? ((sceneBlock.label || '') + ' ' + (sceneBlock.content || '').replace(/^S#\d+\.?\s*/i, '')).trim()
                        : '';
                      const text = (b.content || '').trim();
                      return (
                        <div key={b.id} className="text-xs rounded py-2"
                          style={{ background: 'var(--c-tag)', borderLeft: '2px solid var(--c-accent)', paddingLeft: 14, paddingRight: 12 }}>
                          {sceneLabel && (
                            <div className="text-[10px] mb-0.5" style={{ color: 'var(--c-text5)' }}>{sceneLabel.trim()}</div>
                          )}
                          <div style={{ color: 'var(--c-text3)' }}>
                            {text ? (text.length > 60 ? text.slice(0, 60) + '…' : text) : <span style={{ color: 'var(--c-text6)' }}>(내용 없음)</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Appeared scenes */}
      {hasScenes && (
        <div>
          <div className="text-xs font-medium mb-2" style={{ color: 'var(--c-text4)' }}>
            등장 씬 <span style={{ color: 'var(--c-accent)' }}>{appearedScenes.length}</span>개
          </div>
          <div className="space-y-1">
            {[...appearedScenes]
              .sort((a, b) => {
                const epA = a.episodeId ? (epMap[a.episodeId]?.number ?? 999) : 999;
                const epB = b.episodeId ? (epMap[b.episodeId]?.number ?? 999) : 999;
                if (epA !== epB) return epA - epB;
                return (a.sceneSeq ?? 0) - (b.sceneSeq ?? 0);
              })
              .map((s, idx) => {
                const ep = s.episodeId ? epMap[s.episodeId] : null;
                const sceneBlock = sceneNumberBlocks.find(b => b.sceneId === s.id);
                const label = sceneBlock
                  ? ((sceneBlock.label || '') + ' ' + (sceneBlock.content || '').replace(/^S#\d+\.?\s*/i, '')).trim()
                  : s.location || '';
                const isFirst = idx === 0;
                return (
                  <div key={s.id} className="text-xs rounded py-2"
                    style={{ background: 'var(--c-tag)', borderLeft: `2px solid ${isFirst ? 'var(--c-accent)' : 'var(--c-accent2)'}`, paddingLeft: 14, paddingRight: 12 }}>
                    <div className="flex items-center gap-1.5">
                      {ep && (
                        <span className="text-[10px]" style={{ color: 'var(--c-accent2)' }}>
                          {ep.number}회
                        </span>
                      )}
                      {isFirst && (
                        <span className="text-[9px] px-1 py-0.5 rounded font-semibold shrink-0"
                          style={{ background: 'var(--c-accent)', color: '#fff' }}>첫등장</span>
                      )}
                      <span style={{ color: 'var(--c-text3)' }}>{label.trim()}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CharacterIndexItem ────────────────────────────────────────────────────────
function CharacterIndexItem({ char, isSelected, onClick }) {
  const fullName = charFullName(char);
  const displayName = charDisplayName(char);
  const roles = getCharRoles(char);
  const primary = roles[0];
  const extraCount = Math.max(0, roles.length - 1);

  return (
    <div
      onClick={onClick}
      className="py-2 rounded cursor-pointer"
      style={{
        background: isSelected ? 'var(--c-active)' : 'transparent',
        borderLeft: `2px solid ${isSelected ? 'var(--c-accent)' : 'transparent'}`,
        paddingLeft: isSelected ? 10 : 8,
        paddingRight: 8,
      }}
    >
      <div className="text-sm font-medium truncate" style={{ color: isSelected ? 'var(--c-text)' : 'var(--c-text3)' }}>
        {fullName || displayName}
      </div>
      {primary && (
        <div className="text-[10px] truncate" style={{ color: getRoleColor(primary) }}>
          {getRoleLabel(primary)}
          {extraCount > 0 && <span style={{ color: 'var(--c-text6)', marginLeft: 4 }}>+{extraCount}</span>}
        </div>
      )}
    </div>
  );
}

// ─── CharacterPhoto ────────────────────────────────────────────────────────────
// 캐스팅 참고 사진 1장. 축소 완료 후 onChange를 한 번만 호출한다.
function CharacterPhoto({ char, onChange }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const photo = hasPhoto(char) ? char.photo : null;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택도 동작하도록
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const { dataUrl, w, h } = await buildCharacterPhoto(file);
      onChange({ dataUrl, w, h, updatedAt: now() });
    } catch (err) {
      setError(photoErrorMessage(err?.code));
    } finally {
      setBusy(false);
    }
  };

  const btn = {
    padding: '2px 8px', fontSize: 11, borderRadius: 4,
    border: '1px solid var(--c-border3)', background: 'transparent',
    color: 'var(--c-text4)', cursor: busy ? 'default' : 'pointer',
  };

  return (
    <div className="flex items-start gap-3 mb-3">
      <div
        style={{
          width: 60, height: 80, borderRadius: 6, flexShrink: 0,
          background: 'var(--c-input)', border: '1px solid var(--c-border3)',
          overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {photo ? (
          <img
            src={photo.dataUrl}
            alt={`${charFullName(char) || charDisplayName(char)} 사진`}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <span style={{ fontSize: 10, color: 'var(--c-text6)' }}>사진 없음</span>
        )}
      </div>
      <div className="flex flex-col gap-1 pt-0.5">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          style={{ display: 'none' }}
        />
        <div className="flex gap-1">
          <button onClick={() => inputRef.current?.click()} disabled={busy} style={btn}>
            {busy ? '처리 중…' : photo ? '변경' : '사진 첨부'}
          </button>
          {photo && !busy && (
            <button onClick={() => { setError(''); onChange(null); }} style={{ ...btn, color: '#f87171' }}>삭제</button>
          )}
        </div>
        <span style={{ fontSize: 10, color: 'var(--c-text6)' }}>캐스팅 참고용 · 장변 320px로 축소 저장</span>
        {error && <span style={{ fontSize: 10, color: '#f87171' }}>{error}</span>}
      </div>
    </div>
  );
}

// ─── CharacterDetail ───────────────────────────────────────────────────────────
function CharacterDetail({ char, onEdit, onDelete, onPhotoChange, episodes, scenes, scriptBlocks }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fullName = charFullName(char);
  const displayName = charDisplayName(char);
  const roles = getCharRoles(char);

  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--c-card)', border: '1px solid var(--c-accent)' }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-semibold text-base" style={{ color: 'var(--c-text)' }}>{fullName || displayName}</span>
          {char.surname && char.givenName && (
            <span className="text-[10px] px-1 rounded" style={{ background: 'var(--c-tag)', color: 'var(--c-text5)' }}>호칭: {char.givenName}</span>
          )}
          {char.age && <span className="text-xs" style={{ color: 'var(--c-text5)' }}>{char.age}</span>}
          {char.gender && <span className="text-xs" style={{ color: 'var(--c-text5)' }}>{char.gender}</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} className="px-2 py-1 text-xs rounded"
            style={{ color: 'var(--c-text4)', border: '1px solid var(--c-border3)', background: 'transparent' }}>편집</button>
          {confirmDelete ? (
            <span className="flex items-center gap-1">
              <button onClick={onDelete} className="text-xs px-1" style={{ color: '#f87171' }}>확인</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs px-1" style={{ color: 'var(--c-text5)' }}>취소</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="px-2 py-1 text-xs rounded"
              style={{ color: 'var(--c-text5)', border: '1px solid var(--c-border3)', background: 'transparent' }}>삭제</button>
          )}
        </div>
      </div>

      {/* Roles + occupation */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', marginBottom: 8 }}>
        {roles.map((r) => (
          <span
            key={r}
            style={{
              fontSize: 10.5, fontWeight: 600,
              padding: '1px 7px', borderRadius: 10,
              background: 'var(--c-active)', color: getRoleColor(r),
              border: `1px solid ${getRoleColor(r)}`,
            }}
          >
            {getRoleLabel(r)}
          </span>
        ))}
        {charOccupation(char) && (
          <span className="text-xs" style={{ color: 'var(--c-text5)', marginLeft: roles.length > 0 ? 4 : 0 }}>
            {roles.length > 0 ? '· ' : ''}{charOccupation(char)}
          </span>
        )}
      </div>

      {/* Photo */}
      <CharacterPhoto char={char} onChange={onPhotoChange} />

      {/* Intro */}
      {charIntro(char) && (
        <p className="text-sm leading-relaxed mb-2" style={{ color: 'var(--c-text4)' }}>{charIntro(char)}</p>
      )}

      {/* Extra fields */}
      {charExtraFields(char).length > 0 && (
        <div className="space-y-0.5 mb-2">
          {charExtraFields(char).map(cf => cf.value ? (
            <div key={cf.id} className="text-xs" style={{ color: 'var(--c-text5)' }}>
              <span style={{ color: 'var(--c-text6)' }}>{cf.label}: </span>{cf.value}
            </div>
          ) : null)}
        </div>
      )}

      <CharacterUsage char={char} episodes={episodes} scenes={scenes} scriptBlocks={scriptBlocks} />
    </div>
  );
}

// ─── CharacterPanel ────────────────────────────────────────────────────────────
export default function CharacterPanel() {
  const { state, dispatch } = useApp();
  const { activeProjectId, characters, selectedCharacterId, episodes, scenes, scriptBlocks, synopsisDocs, coverDocs } = state;

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [renameDialog, setRenameDialog] = useState({ open: false, oldName: '', newName: '' });
  const [previewDialog, setPreviewDialog] = useState({ open: false, pairs: [] });
  const [pendingRename, setPendingRename] = useState(null); // { characterId, oldChar, form }
  const helpRef = useRef(null);
  useEffect(() => {
    if (!helpOpen) return;
    const handler = (e) => { if (!helpRef.current?.contains(e.target)) setHelpOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler); };
  }, [helpOpen]);

  const projectChars = characters
    .filter(c => c.projectId === activeProjectId)
    .sort((a, b) => {
      const order = { lead: 0, support: 1, extra: 2 };
      return (order[a.role] ?? 3) - (order[b.role] ?? 3);
    });

  const filtered = search
    ? projectChars.filter(c => {
        const full = charFullName(c);
        const occ  = charOccupation(c);
        const intr = charIntro(c);
        return full.includes(search) || intr.includes(search) || occ.includes(search);
      })
    : projectChars;

  const handleAdd = (form) => {
    const char = { id: genId(), projectId: activeProjectId, ...form, createdAt: now() };
    dispatch({ type: 'ADD_CHARACTER', payload: char });
    setAdding(false);
  };

  const handleEdit = (form) => {
    const oldChar = projectChars.find(c => c.id === editingId);
    setEditingId(null);

    // ── DEBUG ──────────────────────────────────────────────────────────────────
    console.log('[RENAME] handleEdit', {
      oldChar: oldChar ? { id: oldChar.id, surname: oldChar.surname, givenName: oldChar.givenName, name: oldChar.name } : null,
      newForm: { surname: form.surname, givenName: form.givenName, name: form.name },
    });
    // ──────────────────────────────────────────────────────────────────────────

    const pairs = oldChar
      ? generateRenamePairs(oldChar, { surname: form.surname, givenName: form.givenName })
      : [];

    console.log('[RENAME] generated pairs:', JSON.stringify(pairs));

    if (pairs.length === 0) {
      console.log('[RENAME] no pairs → UPDATE_CHARACTER immediately, no rename dialog');
      dispatch({ type: 'UPDATE_CHARACTER', payload: { id: editingId, ...form } });
      return;
    }

    setPendingRename({ characterId: editingId, oldChar, form });
    const oldDisplayName = charFullName(oldChar) || charDisplayName(oldChar);
    const newDisplayName = [form.surname, form.givenName].filter(Boolean).join('') || form.givenName;
    setRenameDialog({ open: true, oldName: oldDisplayName, newName: newDisplayName });
  };

  const handleRenameSkip = useCallback(() => {
    if (pendingRename) {
      dispatch({ type: 'UPDATE_CHARACTER', payload: { id: pendingRename.characterId, ...pendingRename.form } });
      setPendingRename(null);
    }
    setRenameDialog(prev => ({ ...prev, open: false }));
  }, [pendingRename, dispatch]);

  const handleRenameConfirm = useCallback((scope) => {
    setRenameDialog(prev => ({ ...prev, open: false }));
    if (!pendingRename) return;

    const { characterId, oldChar, form } = pendingRename;
    const pairs = generateRenamePairs(oldChar, { surname: form.surname, givenName: form.givenName });
    const opts = { caseSensitive: true };
    const projectBlocks    = scriptBlocks.filter(b => b.projectId === activeProjectId);
    const projectChars     = characters.filter(c => c.projectId === activeProjectId);
    const projectEpisodes  = episodes.filter(e => e.projectId === activeProjectId);
    const synopsisDoc      = (synopsisDocs || []).find(d => d.projectId === activeProjectId) || null;
    const coverDoc         = (coverDocs    || []).find(d => d.projectId === activeProjectId) || null;

    const pairResults = pairs
      .map((pair, pairIdx) => buildPairResult(pair, pairIdx, {
        projectBlocks, synopsisDoc, projectChars, projectEpisodes, coverDoc, scope, opts,
      }))
      .filter(Boolean);

    if (pairResults.length === 0) {
      alert(`본문에서 변경할 내용을 찾을 수 없습니다.`);
      dispatch({ type: 'UPDATE_CHARACTER', payload: { id: characterId, ...form } });
      setPendingRename(null);
      return;
    }

    setPreviewDialog({ open: true, pairResults });
  }, [pendingRename, scriptBlocks, characters, episodes, synopsisDocs, coverDocs, activeProjectId, dispatch]);

  const handlePreviewClose = useCallback(() => {
    if (pendingRename) {
      dispatch({ type: 'UPDATE_CHARACTER', payload: { id: pendingRename.characterId, ...pendingRename.form } });
      setPendingRename(null);
    }
    setPreviewDialog(prev => ({ ...prev, open: false }));
  }, [pendingRename, dispatch]);

  const handlePreviewConfirm = useCallback((checkedKeys) => {
    setPreviewDialog(prev => ({ ...prev, open: false }));
    if (!pendingRename) return;

    const { characterId, form } = pendingRename;
    const { pairResults } = previewDialog;
    const opts            = { caseSensitive: true };
    const projectBlocks   = scriptBlocks.filter(b => b.projectId === activeProjectId);
    const synopsisDoc     = (synopsisDocs || []).find(d => d.projectId === activeProjectId) || null;
    const coverDoc        = (coverDocs    || []).find(d => d.projectId === activeProjectId) || null;

    // 키 파싱: `${pairIdx}::${source}::${unitId}`
    const blocksMap      = new Map(); // pairIdx -> Set<blockId>
    const synopsisMap    = new Map(); // pairIdx -> Set<field>
    const charIntroMap   = new Map(); // pairIdx -> Set<charId>
    const episodeMap     = new Map(); // pairIdx -> Set<episodeId>
    const coverMap       = new Map(); // pairIdx -> { fields: Set, customFieldIds: Set }

    [...checkedKeys].forEach(key => {
      const firstSep  = key.indexOf('::');
      const pairIdx   = parseInt(key.slice(0, firstSep));
      const rest      = key.slice(firstSep + 2);
      const secondSep = rest.indexOf('::');
      const source    = rest.slice(0, secondSep);
      const unitId    = rest.slice(secondSep + 2);

      switch (source) {
        case 'block':
          if (!blocksMap.has(pairIdx)) blocksMap.set(pairIdx, new Set());
          blocksMap.get(pairIdx).add(unitId);
          break;
        case 'synopsis':
          if (!synopsisMap.has(pairIdx)) synopsisMap.set(pairIdx, new Set());
          synopsisMap.get(pairIdx).add(unitId);
          break;
        case 'charIntro':
          if (!charIntroMap.has(pairIdx)) charIntroMap.set(pairIdx, new Set());
          charIntroMap.get(pairIdx).add(unitId);
          break;
        case 'episode':
          if (!episodeMap.has(pairIdx)) episodeMap.set(pairIdx, new Set());
          episodeMap.get(pairIdx).add(unitId);
          break;
        case 'cover':
          if (!coverMap.has(pairIdx)) coverMap.set(pairIdx, { fields: new Set(), customFieldIds: new Set() });
          coverMap.get(pairIdx).fields.add(unitId);
          break;
        case 'coverCustom':
          if (!coverMap.has(pairIdx)) coverMap.set(pairIdx, { fields: new Set(), customFieldIds: new Set() });
          coverMap.get(pairIdx).customFieldIds.add(unitId);
          break;
        default: break;
      }
    });

    let patchedSelfIntro = null; // 당사자 intro 치환 결과 (마지막 dispatch에 합산)

    pairResults.forEach(pair => {
      const { pairIdx, oldText, newText, searchScope, episodeGroups } = pair;
      const pOpts = { ...opts, searchScope };

      // 1. 대본 블록
      const selectedBlockIds = blocksMap.get(pairIdx);
      if (selectedBlockIds?.size > 0) {
        let updated = replaceInSelectedBlocks(projectBlocks, oldText, newText, pOpts, selectedBlockIds);
        const epIds = [...new Set(updated.map(b => b.episodeId).filter(Boolean))];
        epIds.forEach(epId => {
          const payload  = updated.filter(b => b.episodeId === epId);
          const original = projectBlocks.filter(b => b.episodeId === epId);
          if (payload.some((b, i) => b !== original[i])) {
            dispatch({ type: 'SET_BLOCKS', episodeId: epId, payload, _record: true });
          }
        });
      }

      // 2. 시놉시스
      const selectedSynopsisFields = synopsisMap.get(pairIdx);
      if (selectedSynopsisFields?.size > 0 && synopsisDoc) {
        const newDoc = replaceInSynopsisDoc(synopsisDoc, oldText, newText, opts, selectedSynopsisFields);
        if (newDoc !== synopsisDoc) dispatch({ type: 'SET_SYNOPSIS', payload: newDoc });
      }

      // 3. 인물 소개 — 당사자(characterId)는 dispatch 보류, 마지막 UPDATE_CHARACTER에 합산
      const selectedCharIds = charIntroMap.get(pairIdx);
      if (selectedCharIds?.size > 0) {
        characters
          .filter(c => c.projectId === activeProjectId && selectedCharIds.has(c.id))
          .forEach(char => {
            const newChar = replaceInCharacterIntro(char, oldText, newText, opts);
            if (newChar !== char) {
              if (char.id === characterId) {
                patchedSelfIntro = newChar.intro;
              } else {
                dispatch({ type: 'UPDATE_CHARACTER', payload: { id: char.id, intro: newChar.intro } });
              }
            }
          });
      }

      // 4. 에피소드 트리트먼트
      const selectedEpIds = episodeMap.get(pairIdx);
      if (selectedEpIds?.size > 0) {
        selectedEpIds.forEach(epId => {
          const ep      = episodes.find(e => e.id === epId);
          const epGroup = (episodeGroups || []).find(g => g.episodeId === epId);
          if (!ep || !epGroup) return;
          const newEp = replaceInEpisodeSummary(ep, oldText, newText, opts, new Set(epGroup.itemIds));
          if (newEp !== ep) dispatch({ type: 'UPDATE_EPISODE', payload: { id: ep.id, summaryItems: newEp.summaryItems } });
        });
      }

      // 5. 표지
      const coverSel = coverMap.get(pairIdx);
      if (coverSel && coverDoc) {
        const newDoc = replaceInCoverDoc(coverDoc, oldText, newText, opts, coverSel);
        if (newDoc !== coverDoc) dispatch({ type: 'SET_COVER', payload: newDoc });
      }
    });

    dispatch({
      type: 'UPDATE_CHARACTER',
      payload: {
        id: characterId,
        ...form,
        ...(patchedSelfIntro !== null ? { intro: patchedSelfIntro } : {}),
      },
    });
    setPendingRename(null);
  }, [pendingRename, previewDialog, scriptBlocks, characters, episodes, synopsisDocs, coverDocs, activeProjectId, dispatch]);

  const handleSelect = (charId) => {
    setAdding(false);
    setEditingId(null);
    dispatch({ type: 'SET_SELECTED_CHARACTER', id: charId === selectedCharacterId ? null : charId });
  };

  if (!activeProjectId) return null;

  const selectedChar = selectedCharacterId ? projectChars.find(c => c.id === selectedCharacterId) : null;
  const epList    = episodes.filter(e => e.projectId === activeProjectId);
  const sceneList = scenes.filter(s => s.projectId === activeProjectId);
  const blockList = scriptBlocks.filter(b => b.projectId === activeProjectId);

  return (
    <div className="flex-1 min-h-0 flex" style={{ background: 'var(--c-bg)' }}>
      {/* ── Left: index column ── */}
      <div className="flex flex-col shrink-0" style={{ width: 110, borderRight: '1px solid var(--c-border2)' }}>
        {/* Title + Help */}
        <div className="shrink-0 flex items-center gap-1" style={{ padding: '6px 8px', borderBottom: '1px solid var(--c-border2)' }}>
          <span className="text-xs" style={{ color: 'var(--c-text5)' }}>인물</span>
          <div ref={helpRef} style={{ position: 'relative', display: 'inline-flex' }}>
            <button onClick={() => setHelpOpen(v => !v)} title="도움말" style={{ width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--c-border3)', background: helpOpen ? 'var(--c-active)' : 'transparent', color: 'var(--c-text5)', fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0 }}>?</button>
            {helpOpen && (
              <div style={{ position: 'absolute', top: '20px', left: 0, zIndex: 200, background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 8, padding: '10px 14px', width: 220, boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--c-text3)' }}>인물 안내</div>
                {['인물을 추가하고 역할·직업·소개를 입력하세요.', '대사·등장 씬은 대본과 자동동기화 됩니다.'].map((t, i) => (
                  <div key={i} className="text-[11px] leading-relaxed" style={{ color: 'var(--c-text5)' }}>· {t}</div>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* Search */}
        <div className="shrink-0" style={{ padding: '8px 8px 6px', borderBottom: '1px solid var(--c-border2)' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="검색"
            className="w-full text-xs px-2 py-1 rounded outline-none t-input-field"
            style={{ border: '1px solid var(--c-border3)' }}
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto py-1 space-y-0.5" style={{ paddingLeft: 6, paddingRight: 4 }}>
          {filtered.map(char => (
            <CharacterIndexItem
              key={char.id}
              char={char}
              isSelected={!adding && !editingId && selectedCharacterId === char.id}
              onClick={() => handleSelect(char.id)}
            />
          ))}
          {filtered.length === 0 && (
            <div className="text-[10px] text-center py-4" style={{ color: 'var(--c-text6)' }}>
              {search ? '없음' : '인물 없음'}
            </div>
          )}
        </div>

        {/* Add button */}
        <div className="shrink-0" style={{ padding: '6px 8px', borderTop: '1px solid var(--c-border2)' }}>
          <button
            onClick={() => { setAdding(true); setEditingId(null); dispatch({ type: 'SET_SELECTED_CHARACTER', id: null }); }}
            className="w-full py-1.5 text-xs rounded text-white"
            style={{ background: adding ? 'var(--c-accent2)' : 'var(--c-accent)', cursor: 'pointer' }}
          >+ 추가</button>
        </div>
      </div>

      {/* ── Right: detail / form / placeholder ── */}
      <div className="flex-1 min-w-0 overflow-y-auto" style={{ padding: 10 }}>
        {adding && (
          <CharacterForm onSave={handleAdd} onCancel={() => setAdding(false)} />
        )}

        {!adding && editingId && selectedChar && (
          <CharacterForm initial={selectedChar} onSave={handleEdit} onCancel={() => setEditingId(null)} />
        )}

        {!adding && !editingId && selectedChar && (
          <CharacterDetail
            char={selectedChar}
            onEdit={() => setEditingId(selectedChar.id)}
            onDelete={() => dispatch({ type: 'DELETE_CHARACTER', id: selectedChar.id })}
            onPhotoChange={(photo) => dispatch({ type: 'UPDATE_CHARACTER', payload: { id: selectedChar.id, photo } })}
            episodes={epList}
            scenes={sceneList}
            scriptBlocks={blockList}
          />
        )}

        {!adding && !editingId && !selectedChar && (
          <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--c-text6)' }}>
            인물을 선택하세요
          </div>
        )}
      </div>

      <RenameConfirmDialog
        open={renameDialog.open}
        onClose={handleRenameSkip}
        oldName={renameDialog.oldName}
        newName={renameDialog.newName}
        onConfirm={handleRenameConfirm}
      />
      <RenamePreviewDialog
        open={previewDialog.open}
        onClose={handlePreviewClose}
        pairResults={previewDialog.pairResults || []}
        onConfirm={handlePreviewConfirm}
      />
    </div>
  );
}
