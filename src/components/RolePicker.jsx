import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ROLE_CATEGORIES } from './CharacterPanel';

/**
 * RolePicker — 다중 선택 서사 역할 피커.
 *
 * Props:
 *   value     — string[]   (선택된 역할 키 배열)
 *   onChange  — (next: string[]) => void
 *   compact   — boolean    (좁은 폭에서 사용 시 카테고리 한 줄씩 표시)
 *   placeholder — string
 *
 * 동작:
 *   - 칩 형태로 선택된 역할 표시(✕ 클릭 시 제거)
 *   - "+ 역할 추가" 버튼 → 카테고리별 그룹 + 검색이 가능한 팝오버
 *   - 같은 항목 재클릭 = 토글(추가/제거)
 */
export default function RolePicker({ value = [], onChange, compact = false, placeholder = '+ 역할 추가' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);

  const selected = useMemo(() => new Set(value || []), [value]);

  // 외부 클릭 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ROLE_CATEGORIES;
    return ROLE_CATEGORIES.map((cat) => ({
      ...cat,
      items: cat.items.filter((it) =>
        it.label.toLowerCase().includes(q) || it.value.includes(q)
      ),
    })).filter((cat) => cat.items.length > 0);
  }, [query]);

  const toggle = (val) => {
    if (selected.has(val)) {
      onChange((value || []).filter((v) => v !== val));
    } else {
      onChange([...(value || []), val]);
    }
  };

  const removeRole = (val) => onChange((value || []).filter((v) => v !== val));

  // 선택된 역할들의 메타(라벨·색상)
  const selectedMeta = useMemo(() => {
    const out = [];
    for (const v of value || []) {
      for (const cat of ROLE_CATEGORIES) {
        const it = cat.items.find((x) => x.value === v);
        if (it) { out.push({ value: v, label: it.label, color: cat.color }); break; }
      }
    }
    return out;
  }, [value]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
      {selectedMeta.map((m) => (
        <span
          key={m.value}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 6px 2px 8px',
            borderRadius: 10, fontSize: 11, fontWeight: 600,
            background: 'var(--c-active)', color: m.color,
            border: `1px solid ${m.color}`,
          }}
        >
          {m.label}
          <button
            type="button"
            onClick={() => removeRole(m.value)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 11, padding: 0, lineHeight: 1 }}
            title="제거"
          >✕</button>
        </span>
      ))}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: '2px 8px', borderRadius: 10, fontSize: 11,
          border: '1px dashed var(--c-border3)', background: 'transparent',
          color: 'var(--c-text5)', cursor: 'pointer',
        }}
      >
        {placeholder}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%', left: 0,
            marginTop: 4,
            zIndex: 100,
            minWidth: compact ? 240 : 360,
            maxHeight: 400,
            background: 'var(--c-panel)',
            border: '1px solid var(--c-border)',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            placeholder="역할 검색…"
            style={{
              flexShrink: 0,
              padding: '8px 10px', border: 'none',
              borderBottom: '1px solid var(--c-border3)',
              background: 'var(--c-input)', color: 'var(--c-text)',
              fontSize: 12, outline: 'none',
            }}
          />
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 4px' }}>
            {filteredCategories.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--c-text6)' }}>일치하는 역할 없음</div>
            ) : filteredCategories.map((cat) => (
              <div key={cat.id} style={{ marginBottom: 6 }}>
                <div style={{
                  padding: '4px 10px 2px',
                  fontSize: 10, fontWeight: 700, color: cat.color,
                  textTransform: 'uppercase', letterSpacing: 0.5,
                }}>
                  {cat.label}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0 8px 4px' }}>
                  {cat.items.map((it) => {
                    const isSelected = selected.has(it.value);
                    return (
                      <button
                        key={it.value}
                        type="button"
                        onClick={() => toggle(it.value)}
                        style={{
                          padding: '3px 8px', borderRadius: 10, fontSize: 11,
                          border: '1px solid', borderColor: isSelected ? cat.color : 'var(--c-border3)',
                          background: isSelected ? 'var(--c-active)' : 'transparent',
                          color: isSelected ? cat.color : 'var(--c-text4)',
                          cursor: 'pointer', fontWeight: isSelected ? 600 : 400,
                        }}
                      >
                        {isSelected ? '✓ ' : ''}{it.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
