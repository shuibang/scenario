import React, { useEffect, useRef, useState } from 'react';
import { newBlock } from '../../store/ideasStore';
import RolePicker from '../RolePicker';

/**
 * IdeaNoteEditor — 단일 아이디어 편집기
 *
 * 블록 기반: 사용자가 자유 텍스트로 시작하지만, "/" 입력 또는 좌측 + 버튼으로
 * 구조 블록을 삽입할 수 있다. 구조 블록은 대본으로 승격할 때 자동 매핑된다.
 *
 * Props:
 *   idea     — 편집 대상 객체 ({ id, title, tags, blocks, starred, ... })
 *   onChange — (patch: Partial<Idea>) => void
 *   onPromote — () => void (대본으로 승격 버튼 클릭)
 *   onDelete  — () => void
 *   compact  — boolean (사이드 시트 등 좁은 폭에서 활성화)
 */

// 블록 메타데이터.
//   - 시놉시스 페이지(genre/theme/logline/intent/story)와 1:1 매핑
//   - treatment 는 대본 첫 회차 summaryItems 로 자동 전환
const BLOCK_META = {
  memo:      { icon: '📝', label: '메모',         hint: '자유 형식 메모' },
  logline:   { icon: '🎯', label: '로그라인',     hint: '시놉시스 - 한 줄 요약' },
  genre:     { icon: '🏷️', label: '장르',         hint: '시놉시스 - 장르' },
  theme:     { icon: '🎭', label: '주제',         hint: '시놉시스 - 대본이 다루려는 주제' },
  intent:    { icon: '💡', label: '기획의도',     hint: '시놉시스 - 기획 의도' },
  story:     { icon: '📖', label: '줄거리',       hint: '시놉시스 - 전체 줄거리' },
  treatment: { icon: '📋', label: '간략 트리트먼트', hint: '한 줄씩 회차/씬 흐름. 첫 회차 트리트먼트에 자동 추가' },
  character: { icon: '👤', label: '인물',         hint: '인물 이름·역할·설명' },
  note:      { icon: '🗒️', label: '참고 메모',    hint: '레퍼런스·참고할 점' },
  link:      { icon: '🔗', label: '링크',         hint: 'URL 첨부' },
  image:     { icon: '🖼️', label: '이미지',       hint: '이미지 첨부' },
};

// 슬래시 메뉴 — 그룹화: 시놉시스 항목 → 트리트먼트 → 인물 → 참고/첨부
const SLASH_TYPES = ['logline', 'genre', 'theme', 'intent', 'story', 'treatment', 'character', 'note', 'link', 'image'];

// 캐릭터 블록의 역할은 RolePicker(다중)를 사용. ROLE_CATEGORIES 는 CharacterPanel 에서 정의.

export default function IdeaNoteEditor({ idea, onChange, onPromote, onDelete, compact = false }) {
  const [tagDraft, setTagDraft] = useState('');

  if (!idea) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--c-text6)', fontSize: 13 }}>
        아이디어를 선택하거나 새로 만들어주세요.
      </div>
    );
  }

  const updateBlock = (blockId, patch) => {
    onChange({
      blocks: idea.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
    });
  };

  const removeBlock = (blockId) => {
    onChange({ blocks: idea.blocks.filter((b) => b.id !== blockId) });
  };

  const insertBlockAfter = (afterId, type) => {
    const created = newBlock(type, defaultBlockExtras(type));
    const idx = idea.blocks.findIndex((b) => b.id === afterId);
    const next = idea.blocks.slice();
    next.splice(idx + 1, 0, created);
    onChange({ blocks: next });
  };

  const appendBlock = (type) => {
    const created = newBlock(type, defaultBlockExtras(type));
    onChange({ blocks: [...idea.blocks, created] });
  };

  const moveBlock = (blockId, delta) => {
    const idx = idea.blocks.findIndex((b) => b.id === blockId);
    if (idx < 0) return;
    const target = idx + delta;
    if (target < 0 || target >= idea.blocks.length) return;
    const next = idea.blocks.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange({ blocks: next });
  };

  const addTag = () => {
    const v = tagDraft.trim().replace(/^#/, '');
    if (!v) return;
    if ((idea.tags || []).includes(v)) { setTagDraft(''); return; }
    onChange({ tags: [...(idea.tags || []), v] });
    setTagDraft('');
  };

  const removeTag = (t) => onChange({ tags: (idea.tags || []).filter((x) => x !== t) });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 헤더 — 제목 + 별표 + 액션 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => onChange({ starred: !idea.starred })}
          title={idea.starred ? '즐겨찾기 해제' : '즐겨찾기'}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, padding: 4 }}
        >
          {idea.starred ? '⭐' : '☆'}
        </button>
        <input
          type="text"
          value={idea.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="아이디어 제목"
          style={{
            flex: 1, fontSize: 17, fontWeight: 600, color: 'var(--c-text)',
            background: 'transparent', border: 'none', outline: 'none', padding: '4px 0',
          }}
        />
        {onPromote && (
          <button
            onClick={onPromote}
            title="이 아이디어로 새 대본 만들기"
            style={{
              padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              border: '1px solid var(--c-accent)', background: 'var(--c-active)',
              color: 'var(--c-accent)', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >➕ 대본으로</button>
        )}
        {onDelete && (
          <button
            onClick={() => { if (window.confirm('이 아이디어를 삭제할까요?')) onDelete(); }}
            title="삭제"
            style={{
              padding: '6px 8px', borderRadius: 6, fontSize: 11,
              border: '1px solid var(--c-border3)', background: 'transparent',
              color: 'var(--c-text5)', cursor: 'pointer',
            }}
          >🗑</button>
        )}
      </div>

      {/* 태그 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {(idea.tags || []).map((t) => (
          <span
            key={t}
            style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 12,
              background: 'var(--c-active)', color: 'var(--c-accent)',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            #{t}
            <button
              onClick={() => removeTag(t)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--c-text5)', fontSize: 11, padding: 0 }}
            >✕</button>
          </span>
        ))}
        <input
          type="text"
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
            if (e.key === 'Backspace' && !tagDraft && (idea.tags || []).length > 0) {
              removeTag(idea.tags[idea.tags.length - 1]);
            }
          }}
          placeholder="태그 추가 (Enter)"
          style={{
            fontSize: 11, padding: '3px 8px', borderRadius: 12,
            border: '1px dashed var(--c-border3)', background: 'transparent',
            color: 'var(--c-text)', outline: 'none', minWidth: 100,
          }}
        />
      </div>

      {/* 블록들 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {idea.blocks.map((block, idx) => (
          <BlockRow
            key={block.id}
            block={block}
            isFirst={idx === 0}
            isLast={idx === idea.blocks.length - 1}
            onUpdate={(patch) => updateBlock(block.id, patch)}
            onInsertAfter={(type) => insertBlockAfter(block.id, type)}
            onRemove={() => removeBlock(block.id)}
            onMoveUp={() => moveBlock(block.id, -1)}
            onMoveDown={() => moveBlock(block.id, 1)}
            compact={compact}
          />
        ))}
      </div>

      {/* 블록 추가 가이드 */}
      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--c-text6)' }}>
        본문에 <kbd style={kbdStyle}>/</kbd> 입력 또는 옆 <strong>+</strong> 버튼으로 구조 블록 추가
      </div>

      {/* 하단: 빠른 추가 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {SLASH_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => appendBlock(type)}
            style={{
              padding: '4px 8px', borderRadius: 4, fontSize: 11,
              border: '1px solid var(--c-border3)', background: 'transparent',
              color: 'var(--c-text4)', cursor: 'pointer',
            }}
            title={BLOCK_META[type].hint}
          >
            {BLOCK_META[type].icon} {BLOCK_META[type].label}
          </button>
        ))}
      </div>
    </div>
  );
}

function defaultBlockExtras(type) {
  if (type === 'character') return { name: '', roles: [], content: '' };
  if (type === 'link')      return { url: '', title: '' };
  if (type === 'image')     return { url: '' };
  return { content: '' };
}

const kbdStyle = {
  display: 'inline-block',
  padding: '0 4px',
  border: '1px solid var(--c-border3)',
  borderRadius: 3,
  fontSize: 10,
  background: 'var(--c-input)',
  color: 'var(--c-text4)',
  fontFamily: 'inherit',
};

// ─── BlockRow ──────────────────────────────────────────────────────────────
function BlockRow({ block, isFirst, isLast, onUpdate, onInsertAfter, onRemove, onMoveUp, onMoveDown, compact }) {
  const meta = BLOCK_META[block.type];
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const textareaRef = useRef(null);

  const handleKeyDown = (e) => {
    // "/" 가 줄 시작에서 입력되면 슬래시 메뉴
    if (e.key === '/' && (e.target.selectionStart === 0 || e.target.value === '')) {
      e.preventDefault();
      setSlashOpen(true);
      setSlashQuery('');
    }
    if (e.key === 'Escape' && slashOpen) {
      setSlashOpen(false);
    }
  };

  const onSlashPick = (type) => {
    setSlashOpen(false);
    onInsertAfter(type);
  };

  return (
    <div
      style={{
        position: 'relative',
        border: '1px solid var(--c-border3)',
        borderRadius: 6,
        background: 'var(--c-card)',
      }}
    >
      {/* 블록 헤더 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 10px',
        borderBottom: '1px solid var(--c-border3)',
        background: 'var(--c-input)',
      }}>
        <span style={{ fontSize: 12 }}>{meta.icon}</span>
        <span style={{ fontSize: 10.5, color: 'var(--c-text4)', fontWeight: 600, letterSpacing: 0.2 }}>
          {meta.label}
        </span>
        <span style={{ fontSize: 9.5, color: 'var(--c-text6)' }}>{meta.hint}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
          {!isFirst && (
            <button onClick={onMoveUp} title="위로" style={blockHeaderBtnStyle}>▲</button>
          )}
          {!isLast && (
            <button onClick={onMoveDown} title="아래로" style={blockHeaderBtnStyle}>▼</button>
          )}
          <SlashMenuButton onPick={onInsertAfter} />
          <button onClick={onRemove} title="블록 삭제" style={blockHeaderBtnStyle}>✕</button>
        </div>
      </div>

      {/* 블록 본문 */}
      <div style={{ padding: '8px 10px' }}>
        {block.type === 'character' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input
              type="text"
              value={block.name || ''}
              onChange={(e) => onUpdate({ name: e.target.value })}
              placeholder="인물 이름 (예: 서주)"
              style={inputStyle}
            />
            <div>
              <RolePicker
                value={Array.isArray(block.roles) ? block.roles : (block.role ? [block.role] : [])}
                onChange={(next) => onUpdate({ roles: next, role: undefined })}
                compact
              />
            </div>
            <textarea
              ref={textareaRef}
              value={block.content || ''}
              onChange={(e) => onUpdate({ content: e.target.value })}
              onKeyDown={handleKeyDown}
              placeholder="인물 설명·배경·성격…"
              rows={compact ? 3 : 4}
              style={textareaStyle}
            />
          </div>
        )}

        {block.type === 'link' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input
              type="url"
              value={block.url || ''}
              onChange={(e) => onUpdate({ url: e.target.value })}
              placeholder="https://..."
              style={inputStyle}
            />
            <input
              type="text"
              value={block.title || ''}
              onChange={(e) => onUpdate({ title: e.target.value })}
              placeholder="링크 설명 (선택)"
              style={inputStyle}
            />
            {block.url && (
              <a href={block.url} target="_blank" rel="noreferrer noopener" style={{ fontSize: 11, color: 'var(--c-accent)' }}>
                ↗ 열기
              </a>
            )}
          </div>
        )}

        {block.type === 'image' && (
          <ImageBlockBody block={block} onUpdate={onUpdate} compact={compact} />
        )}

        {(block.type === 'memo' || block.type === 'logline' || block.type === 'genre' || block.type === 'theme' || block.type === 'intent' || block.type === 'story' || block.type === 'treatment' || block.type === 'note') && (
          <textarea
            ref={textareaRef}
            value={block.content || ''}
            onChange={(e) => onUpdate({ content: e.target.value })}
            onKeyDown={handleKeyDown}
            placeholder={
              block.type === 'logline'   ? '한 줄로 요약 — 예: "엄마가 사실 다른 사람이라면?"' :
              block.type === 'genre'     ? '예: 가족 멜로, 미스터리 스릴러, 로맨틱 코미디' :
              block.type === 'theme'     ? '대본이 다루려는 주제·메시지' :
              block.type === 'intent'    ? '이 대본을 왜 쓰는지·무엇을 말하고 싶은지' :
              block.type === 'story'     ? '전체 줄거리를 자유롭게 적어주세요.' :
              block.type === 'treatment' ? '한 줄에 한 회차/씬 흐름. 대본 만들 때 첫 회차 트리트먼트로 자동 추가됩니다.' :
              block.type === 'note'      ? '참고할 점·레퍼런스·아이디어 조각' :
              '메모 자유 입력 — / 입력 시 다른 구조 블록 추가'
            }
            rows={
              block.type === 'logline' ? 2 :
              block.type === 'genre'   ? 2 :
              (compact ? 4 : 6)
            }
            style={textareaStyle}
          />
        )}

        {/* 슬래시 메뉴 — 본문에서 / 입력 시 열림 */}
        {slashOpen && (
          <SlashMenuDropdown query={slashQuery} setQuery={setSlashQuery} onPick={onSlashPick} onClose={() => setSlashOpen(false)} />
        )}
      </div>
    </div>
  );
}

function SlashMenuButton({ onPick }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="이 아래에 블록 삽입"
        style={blockHeaderBtnStyle}
      >+</button>
      {open && (
        <SlashMenuDropdown
          query=""
          onPick={(t) => { setOpen(false); onPick(t); }}
          onClose={() => setOpen(false)}
          rightAlign
        />
      )}
    </div>
  );
}

function SlashMenuDropdown({ query, setQuery, onPick, onClose, rightAlign = false }) {
  const filtered = SLASH_TYPES.filter((t) => {
    const m = BLOCK_META[t];
    const q = (query || '').toLowerCase().trim();
    if (!q) return true;
    return m.label.toLowerCase().includes(q) || t.includes(q);
  });

  useEffect(() => {
    const close = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'absolute',
        ...(rightAlign ? { right: 0 } : { left: 8 }),
        top: '100%',
        marginTop: 4,
        zIndex: 50,
        background: 'var(--c-panel)',
        border: '1px solid var(--c-border)',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        minWidth: 180,
        overflow: 'hidden',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {setQuery !== undefined && (
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          placeholder="블록 검색…"
          style={{
            width: '100%', padding: '6px 10px',
            border: 'none', borderBottom: '1px solid var(--c-border3)',
            background: 'var(--c-input)', color: 'var(--c-text)',
            fontSize: 12, outline: 'none', boxSizing: 'border-box',
          }}
        />
      )}
      <div style={{ maxHeight: 240, overflowY: 'auto' }}>
        {filtered.map((type) => (
          <button
            key={type}
            onClick={() => onPick(type)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '7px 10px', textAlign: 'left',
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'var(--c-text2)', fontSize: 12,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--c-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span>{BLOCK_META[type].icon}</span>
            <span style={{ fontWeight: 600 }}>{BLOCK_META[type].label}</span>
            <span style={{ color: 'var(--c-text6)', fontSize: 10, marginLeft: 'auto' }}>
              {BLOCK_META[type].hint}
            </span>
          </button>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--c-text6)' }}>일치하는 블록 없음</div>
        )}
      </div>
    </div>
  );
}

function ImageBlockBody({ block, onUpdate, compact }) {
  const fileRef = useRef(null);

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 첨부할 수 있어요.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      if (!window.confirm('이미지가 2MB를 넘어요. 그래도 첨부할까요? (Drive 동기화 용량 영향 큼)')) return;
    }
    const reader = new FileReader();
    reader.onload = (e) => onUpdate({ url: e.target.result, name: file.name });
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {block.url ? (
        <>
          <img src={block.url} alt={block.name || ''} style={{ maxWidth: '100%', maxHeight: compact ? 200 : 320, borderRadius: 4, border: '1px solid var(--c-border3)' }} />
          <button
            onClick={() => onUpdate({ url: '', name: '' })}
            style={{ alignSelf: 'flex-start', fontSize: 11, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--c-border3)', background: 'transparent', color: 'var(--c-text5)', cursor: 'pointer' }}
          >이미지 제거</button>
        </>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          style={{
            padding: '20px 12px', textAlign: 'center', borderRadius: 4,
            border: '1.5px dashed var(--c-border3)', color: 'var(--c-text5)', fontSize: 12,
            cursor: 'pointer',
          }}
          onClick={() => fileRef.current?.click()}
        >
          이미지를 드래그하거나 클릭해서 선택
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      )}
    </div>
  );
}

// ─── 공통 스타일 ───────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '6px 8px', borderRadius: 4,
  border: '1px solid var(--c-border3)', background: 'var(--c-input)',
  color: 'var(--c-text)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const textareaStyle = {
  ...inputStyle,
  fontSize: 13.5,
  resize: 'vertical',
  lineHeight: 1.6,
  fontFamily: 'inherit',
};

const blockHeaderBtnStyle = {
  background: 'transparent', border: 'none', color: 'var(--c-text5)',
  cursor: 'pointer', fontSize: 11, padding: '2px 6px', borderRadius: 3,
};
