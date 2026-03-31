import React, { useState, useMemo } from 'react';
import { QNA_CATEGORIES } from './QnAData';

// ─── Single accordion item ─────────────────────────────────────────────────────
function AccordionItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        borderBottom: '1px solid var(--c-border)',
      }}
    >
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', textAlign: 'left', background: 'none', border: 'none',
          cursor: 'pointer', padding: '12px 0', display: 'flex', alignItems: 'flex-start',
          gap: '10px',
        }}
      >
        <span
          style={{
            flexShrink: 0, width: '18px', height: '18px', marginTop: '1px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '10px', color: 'var(--c-accent)',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
          }}
        >
          ▶
        </span>
        <span
          style={{
            fontSize: '14px', lineHeight: '1.5', color: 'var(--c-text2)',
            fontWeight: open ? 600 : 400,
            flex: 1,
          }}
        >
          {q}
        </span>
      </button>

      {open && (
        <div
          style={{
            paddingLeft: '28px', paddingBottom: '14px',
            fontSize: '13px', lineHeight: '1.7',
            color: 'var(--c-text4)',
          }}
        >
          {a}
        </div>
      )}
    </div>
  );
}

// ─── Category section ──────────────────────────────────────────────────────────
function CategorySection({ category, items }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: '2rem' }}>
      <div
        style={{
          fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em',
          color: 'var(--c-accent)', textTransform: 'uppercase',
          marginBottom: '4px', paddingBottom: '6px',
          borderBottom: '2px solid var(--c-accent)',
          display: 'inline-block',
        }}
      >
        {category}
      </div>
      <div style={{ marginTop: '4px' }}>
        {items.map((item, i) => (
          <AccordionItem key={i} q={item.q} a={item.a} />
        ))}
      </div>
    </div>
  );
}

// ─── QnATab ────────────────────────────────────────────────────────────────────
export default function QnATab() {
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return QNA_CATEGORIES.map(cat => {
      if (activeCat !== 'all' && cat.id !== activeCat) return { ...cat, items: [] };
      if (!q) return cat;
      return {
        ...cat,
        items: cat.items.filter(
          item => item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q)
        ),
      };
    });
  }, [search, activeCat]);

  const totalVisible = filtered.reduce((s, c) => s + c.items.length, 0);

  return (
    <div>
      {/* 헤더 */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2
          style={{
            fontSize: '18px', fontWeight: 700, color: 'var(--c-text)',
            marginBottom: '6px',
          }}
        >
          자주 묻는 질문
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--c-text5)', lineHeight: '1.6' }}>
          처음 사용하는 방법부터 저장, 출력, 공유, 작업기록까지 자주 묻는 질문을 모았습니다.
        </p>
      </div>

      {/* 검색창 */}
      <div style={{ marginBottom: '1rem', position: 'relative' }}>
        <span
          style={{
            position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
            color: 'var(--c-text6)', fontSize: '13px', pointerEvents: 'none',
          }}
        >
          🔍
        </span>
        <input
          type="text"
          placeholder="질문 검색…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '8px 12px 8px 32px',
            background: 'var(--c-input)',
            border: '1px solid var(--c-border3)',
            borderRadius: '6px',
            fontSize: '13px', color: 'var(--c-text)',
            outline: 'none',
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--c-accent)'; }}
          onBlur={e => { e.target.style.borderColor = 'var(--c-border3)'; }}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            style={{
              position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--c-text6)', fontSize: '14px', lineHeight: 1, padding: '2px 4px',
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* 카테고리 탭 */}
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: '6px',
          marginBottom: '1.5rem',
        }}
      >
        <CategoryPill id="all" label="전체" active={activeCat === 'all'} onClick={() => setActiveCat('all')} />
        {QNA_CATEGORIES.map(cat => (
          <CategoryPill
            key={cat.id}
            id={cat.id}
            label={cat.label}
            active={activeCat === cat.id}
            onClick={() => setActiveCat(cat.id)}
          />
        ))}
      </div>

      {/* 결과 없음 */}
      {totalVisible === 0 && (
        <div
          style={{
            textAlign: 'center', padding: '3rem 0',
            color: 'var(--c-text5)', fontSize: '13px',
          }}
        >
          검색 결과가 없습니다.{' '}
          <button
            onClick={() => { setSearch(''); setActiveCat('all'); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-accent)', fontSize: '13px', textDecoration: 'underline' }}
          >
            초기화
          </button>
        </div>
      )}

      {/* 카테고리 섹션들 */}
      {filtered.map(cat => (
        <CategorySection key={cat.id} category={cat.label} items={cat.items} />
      ))}
    </div>
  );
}

// ─── CategoryPill ──────────────────────────────────────────────────────────────
function CategoryPill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        border: `1px solid ${active ? 'var(--c-accent)' : 'var(--c-border3)'}`,
        background: active ? 'var(--c-accent)' : 'transparent',
        color: active ? '#fff' : 'var(--c-text4)',
        transition: 'background 0.1s, color 0.1s, border-color 0.1s',
      }}
    >
      {label}
    </button>
  );
}
