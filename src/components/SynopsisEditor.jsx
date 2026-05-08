import React, { useState, useEffect, useRef, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { useApp } from '../store/AppContext';
import { genId, now } from '../store/db';

// ─── Section definitions
const SECTIONS = [
  { id: 'genre',    label: '장르',    type: 'input',    placeholder: '예: 로맨스 · 드라마 · 스릴러' },
  { id: 'theme',    label: '주제',    type: 'rich',     placeholder: '이 작품이 말하려는 핵심 메시지' },
  { id: 'logline',  label: '로그라인', type: 'rich',     placeholder: '한 문장으로 요약한 이야기' },
  { id: 'intent',   label: '기획의도', type: 'rich',     placeholder: '왜 이 이야기인가' },
  { id: 'story',    label: '줄거리',  type: 'rich',     placeholder: '전체 이야기 흐름 (기승전결)' },
];

// ─── Migrate old plain-text synopsis → new section format
function migrateDoc(doc) {
  if (!doc) return { genre: '', theme: '', logline: '', intent: '', story: '' };
  if (doc.genre !== undefined) return {
    genre:   doc.genre   || '',
    theme:   doc.theme   || '',
    logline: doc.logline || '',
    intent:  doc.intent  || '',
    story:   doc.story   || '',
  };
  return { genre: '', theme: '', logline: '', intent: '', story: doc.content || '' };
}

// strip HTML tags for plain text counts
function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
}

// 시놉시스 HTML 허용 태그: div + 인라인 서식 + br.
// div를 인정해서 Chrome contenteditable의 자연스러운 표현(엔터 = <div>)을 그대로 저장/로드.
// 이전엔 div를 br로 정규화했지만, paste/저장/로드 사이클에서 br placeholder가 사라지거나
// 누적되는 회귀 발생 → div 자체를 보존하는 것이 가장 멱등성 안전.
const ALLOWED_RICH_TAGS = ['div', 'b', 'i', 'u', 'br', 'strong', 'em'];
function sanitizeRichValue(html) {
  return DOMPurify.sanitize(html || '', { ALLOWED_TAGS: ALLOWED_RICH_TAGS, ALLOWED_ATTR: [] });
}

// ─── RichField: contenteditable div
function RichField({ label, value, onChange, placeholder, readOnly }) {
  const ref = useRef(null);
  const skipNextEffect = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Load initial content / external value change (e.g. project switch)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (skipNextEffect.current) { skipNextEffect.current = false; return; }
    // Don't overwrite while user is actively editing
    if (document.activeElement === el) return;
    const sanitized = sanitizeRichValue(value);
    // 동일한 sanitize 결과면 innerHTML 재셋 skip — contenteditable의 native undo history
    // 보존(Ctrl+Z 동작) + Chrome이 innerHTML 셋마다 자체 변형(빈 줄 추가)하는 회귀 차단.
    if (el.innerHTML === sanitized) return;
    el.innerHTML = sanitized;
  }, [value]);

  // unmount 직전 마지막 raw 강제 저장 — 빠른 페이지 이동 시 자동저장 race로
  // 마지막 입력이 손실되던 회귀 차단. 부모가 onChange를 매 렌더 새로 만들어도
  // ref로 안정화해 cleanup이 올바른 onChange를 호출.
  useEffect(() => {
    return () => {
      if (ref.current) onChangeRef.current(ref.current.innerHTML ?? '');
    };
  }, []);

  const handleInput = () => {
    skipNextEffect.current = true;
    // sanitize 후 저장 — useEffect의 동일성 가드와 정확히 매칭되어 innerHTML 재셋 회피.
    const raw = ref.current?.innerHTML ?? '';
    onChange(sanitizeRichValue(raw));
  };

  // Paste: strip formatting, keep plain text. Chrome 기본 동작에 맡겨 caret 컨텍스트 자연 처리.
  // div 직접 구성 시 caret이 div 안에 있으면 nested div가 만들어져 빈 줄 추가되는 회귀 발생.
  // execCommand('insertText') + 변환 없는 raw 저장(handleInput) 조합으로 멱등성 보장.
  const handlePaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    document.execCommand('insertText', false, text);
  };

  const baseStyle = {
    background: 'var(--c-input)',
    color: 'var(--c-text)',
    border: '1px solid var(--c-border3)',
    borderRadius: '0.375rem',
    outline: 'none',
    width: '100%',
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    lineHeight: 1.7,
    fontFamily: 'inherit',
    minHeight: '2.5rem',
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
    cursor: readOnly ? 'default' : 'text',
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--c-text5)', marginBottom: 5 }}>
        {label}
      </label>
      <div
        ref={ref}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        data-placeholder={placeholder}
        style={baseStyle}
      />
    </div>
  );
}

// ─── Character field compat helpers
function charFullName(c) {
  if (c.surname || c.givenName) return [c.surname, c.givenName].filter(Boolean).join('');
  return c.name || '';
}
function charOccupation(c) { return c.occupation ?? c.job ?? ''; }
function charIntro(c) { return c.intro ?? c.description ?? ''; }

// ─── Character-derived 인물설정 view
function CharacterSettings({ characters }) {
  if (!characters.length) {
    return (
      <div className="py-4 text-sm italic" style={{ color: 'var(--c-text5)' }}>
        참고자료 &gt; 인물 페이지에서 인물을 추가하면 여기에 표시됩니다.
      </div>
    );
  }
  const order = { lead: 0, support: 1, extra: 2 };
  const sorted = [...characters].sort((a, b) => (order[a.role] ?? 3) - (order[b.role] ?? 3));
  const roleLabel = { lead: '주인공', support: '조연', extra: '단역' };

  return (
    <div className="space-y-3">
      {sorted.map(c => {
        const fullName   = charFullName(c);
        const occupation = charOccupation(c);
        const intro      = charIntro(c);
        return (
          <div key={c.id} className="py-2 px-3 rounded" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>{fullName}</span>
              {c.gender   && <span className="text-xs" style={{ color: 'var(--c-text4)' }}>{c.gender}</span>}
              {c.age      && <span className="text-xs" style={{ color: 'var(--c-text4)' }}>{c.age}</span>}
              {occupation && <span className="text-xs" style={{ color: 'var(--c-text4)' }}>{occupation}</span>}
              <span className="text-[10px] ml-auto" style={{ color: 'var(--c-accent2)' }}>{roleLabel[c.role] || c.role}</span>
            </div>
            {intro && <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--c-text3)' }}>{intro}</p>}
          </div>
        );
      })}
    </div>
  );
}

// ─── SynopsisEditor
export default function SynopsisEditor() {
  const { state, dispatch } = useApp();
  const { activeProjectId, synopsisDocs, characters, stylePreset } = state;

  const existing = synopsisDocs.find(d => d.projectId === activeProjectId);
  const [sections, setSections] = useState({ genre: '', theme: '', logline: '', intent: '', story: '' });
  const [dirty, setDirty] = useState(false);
  const saveTimer = useRef(null);

  const projectChars = characters.filter(c => c.projectId === activeProjectId);

  useEffect(() => {
    setSections(migrateDoc(existing));
    setDirty(false);
  }, [activeProjectId, existing?.id]);

  const handleChange = (id, value) => {
    setSections(prev => ({ ...prev, [id]: value }));
    setDirty(true);
  };

  // Auto-save (1s debounce)
  useEffect(() => {
    if (!dirty || !activeProjectId) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const doc = {
        ...(existing || { id: genId(), createdAt: now() }),
        projectId: activeProjectId,
        ...sections,
        content: stripHtml(sections.story), // compat: plain text for old readers
        updatedAt: now(),
      };
      dispatch({ type: 'SET_SYNOPSIS', payload: doc });
      setDirty(false);
    }, 1000);
    return () => clearTimeout(saveTimer.current);
  }, [sections, dirty]);

  const plainAll = Object.values(sections).map(stripHtml).join(' ');

  const pageEst = (() => {
    const text = plainAll.trim();
    if (!text) return 0;
    const fontSize   = stylePreset?.fontSize ?? 11;
    const lineHeight = stylePreset?.lineHeight ?? 1.6;
    const margins    = stylePreset?.pageMargins ?? { top: 35, bottom: 30 };
    const usablePt   = 841.89 - (margins.top + margins.bottom) * 2.835;
    const linesPerPage = Math.floor(usablePt / (fontSize * lineHeight));
    const charsPerLine = Math.round(50 * (11 / fontSize));
    return Math.max(1, Math.ceil(Math.ceil(text.length / charsPerLine) / linesPerPage));
  })();

  const scrollRef = useRef(null);

  // Typewriter mode: center focused field
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const onFocusin = (e) => {
      const target = e.target;
      if (target.tagName !== 'TEXTAREA' && target.tagName !== 'INPUT' && !target.isContentEditable) return;
      requestAnimationFrame(() => {
        const containerRect = container.getBoundingClientRect();
        const targetRect    = target.getBoundingClientRect();
        const targetCenter  = targetRect.top + targetRect.height / 2 - containerRect.top;
        container.scrollTop += targetCenter - containerRect.height / 2;
      });
    };
    container.addEventListener('focusin', onFocusin);
    return () => container.removeEventListener('focusin', onFocusin);
  }, []);

  if (!activeProjectId) return null;

  return (
    <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, display: 'flex', flexDirection: 'column', background: 'var(--c-bg)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '10px', borderBottom: '1px solid var(--c-border2)' }}>
        <span className="text-sm font-medium" style={{ color: 'var(--c-text2)' }}>작품 시놉시스</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--c-text6)' }}>
          {pageEst > 0 && <span>{`약 ${pageEst}p`}</span>}
          {dirty ? '저장 중…' : '● 저장됨'}
        </span>
      </div>

      {/* Sections */}
      <div ref={scrollRef} data-synopsis-scroll style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto' }}>
        <div className="space-y-8" style={{ padding: '10px' }}>
          {SECTIONS.map(sec => sec.type === 'input' ? (
            <div key={sec.id} className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--c-text5)', marginBottom: 5 }}>
                {sec.label}
              </label>
              <input
                value={sections[sec.id] || ''}
                onChange={e => handleChange(sec.id, e.target.value)}
                placeholder={sec.placeholder}
                style={{
                  background: 'var(--c-input)', color: 'var(--c-text)',
                  border: '1px solid var(--c-border3)', borderRadius: '0.375rem',
                  outline: 'none', width: '100%', padding: '0.5rem 0.75rem',
                  fontSize: '0.875rem', fontFamily: 'inherit',
                }}
              />
            </div>
          ) : (
            <RichField
              key={sec.id}
              label={sec.label}
              value={sections[sec.id] || ''}
              onChange={v => handleChange(sec.id, v)}
              placeholder={sec.placeholder}
            />
          ))}

          {/* 인물설정 */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--c-text5)' }}>인물설정</label>
              <span className="text-[10px]" style={{ color: 'var(--c-text6)' }}>(참고자료 인물 페이지와 동기화)</span>
            </div>
            <CharacterSettings characters={projectChars} />
          </div>
        </div>
      </div>
    </div>
  );
}
