import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  if (doc.genre !== undefined) return { logline: '', ...doc };
  return { genre: '', theme: '', logline: '', intent: '', story: doc.content || '' };
}

// strip HTML tags for plain text counts
function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
}

// ─── RichField: contenteditable div
function RichField({ label, value, onChange, placeholder, readOnly }) {
  const ref = useRef(null);
  const skipNextEffect = useRef(false);

  // Load initial content / external value change (e.g. project switch)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (skipNextEffect.current) { skipNextEffect.current = false; return; }
    // Don't overwrite while user is actively editing
    if (document.activeElement === el) return;
    el.innerHTML = value || '';
  }, [value]);

  const handleInput = () => {
    skipNextEffect.current = true;
    onChange(ref.current?.innerHTML ?? '');
  };

  // Paste: strip formatting, keep plain text
  const handlePaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
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
  const wordCount = plainAll.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length;

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
    <div className="h-full flex flex-col" style={{ background: 'var(--c-bg)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 shrink-0" style={{ padding: '10px', borderBottom: '1px solid var(--c-border2)' }}>
        <span className="text-sm font-medium" style={{ color: 'var(--c-text2)' }}>작품 시놉시스</span>
        <span className="ml-auto text-xs flex items-center gap-2" style={{ color: 'var(--c-text6)' }}>
          {pageEst > 0 && <span className="tabular-nums">약 {pageEst}p</span>}
          {dirty ? '저장 중…' : '● 저장됨'} · {wordCount}어
        </span>
      </div>

      {/* Sections */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
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
