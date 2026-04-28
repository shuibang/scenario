import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ALL_EMOTIONS as EMOTION_ALL } from '../data/emotionTags';
import { BUILTIN_GUIDES } from '../data/structureTags';
import { getPickerPosition, measureBottomReserved } from '../utils/pickerPosition';

export default function UnifiedTagPicker({
  anchorRect,
  position, // legacy: anchorRect 미사용 호출자(TreatmentPage 등) 폴백용 — 보정 없는 raw 좌표
  currentStructureTags = [],
  onAddStructure,
  onOpenFullPicker,
  onClose,
}) {
  const [query, setQuery] = useState('');
  const [selIdx, setSelIdx] = useState(0);
  // anchorRect 모드: 측정 전엔 null로 두고 visibility:hidden → 깜빡임 방지
  // legacy position 모드: 부모가 좌표 책임 → 즉시 가시
  const [pos, setPos] = useState(anchorRect ? null : position || null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const panelRef = useRef(null);
  useEffect(() => { requestAnimationFrame(() => inputRef.current?.focus()); }, []);

  // 마운트/리사이즈/anchor 변경 시 위치 재계산 (anchorRect 모드)
  useLayoutEffect(() => {
    if (!anchorRect || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    setPos(getPickerPosition({
      anchorRect,
      pickerSize: { width: rect.width || 260, height: rect.height || 360 },
      bottomReserved: measureBottomReserved(),
    }));
  }, [anchorRect]);

  // 스크롤/리사이즈 시 자동 닫기 (anchor 기반일 때만)
  // capture: true 필수 — 페이지/에디터 scroll은 bubbling되지 않음. 단 picker 내부(검색 결과 목록 등) scroll은 무시.
  useEffect(() => {
    if (!anchorRect) return;
    const onScroll = (e) => {
      // picker 내부(검색 결과 목록 등) 스크롤은 무시
      if (panelRef.current && e.target && panelRef.current.contains(e.target)) return;
      onClose?.();
    };
    const onResize = () => onClose?.();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('scroll', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('scroll', onScroll);
    };
  }, [anchorRect, onClose]);

  const q = query.trim().toLowerCase();

  const emotionResults = useMemo(() => {
    if (!q) {
      const seen = new Set();
      return EMOTION_ALL.filter(e => { if (seen.has(e.categoryLabel)) return false; seen.add(e.categoryLabel); return true; });
    }
    return EMOTION_ALL.filter(e => e.word.includes(q));
  }, [q]);

  const structureResults = useMemo(() => {
    const all = BUILTIN_GUIDES.flatMap(g => g.beats.map(b => ({ beat: b, guideName: g.name, color: g.color })));
    if (!q) return all;
    return all.filter(r => r.beat.includes(q));
  }, [q]);

  const allItems = useMemo(() => {
    const items = [
      ...emotionResults.slice(0, 8).map(em => ({ kind: 'emotion', em })),
      ...structureResults.slice(0, 8).filter(r => !currentStructureTags.includes(r.beat)).map(r => ({ kind: 'structure', r })),
    ];
    if (q) items.push({ kind: 'custom' });
    return items;
  }, [emotionResults, structureResults, currentStructureTags, q]);

  useEffect(() => { setSelIdx(0); }, [query]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector('[data-tag-selected="true"]');
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [selIdx]);

  const commit = (item) => {
    if (!item) return;
    if (item.kind === 'emotion') { onOpenFullPicker(item.em.word); onClose(); }
    else if (item.kind === 'structure') { onAddStructure(item.r.beat); onClose(); }
    else if (item.kind === 'custom') { onOpenFullPicker(q); onClose(); }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelIdx(i => Math.min(i + 1, allItems.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); commit(allItems[selIdx]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  const isSelected = (kind, key) => {
    const item = allItems[selIdx];
    if (!item) return false;
    if (kind === 'emotion' && item.kind === 'emotion') return item.em.word === key;
    if (kind === 'structure' && item.kind === 'structure') return item.r.beat === key;
    if (kind === 'custom' && item.kind === 'custom') return true;
    return false;
  };

  return createPortal(
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 299 }} onMouseDown={onClose} />
      <div
        ref={panelRef}
        style={{
          position: 'fixed',
          top: pos?.top ?? -9999, left: pos?.left ?? -9999,
          visibility: (anchorRect && !pos) ? 'hidden' : 'visible',
          zIndex: 300, background: 'var(--c-panel)', border: '1px solid var(--c-border2)',
          borderRadius: 10, boxShadow: '0 6px 24px rgba(0,0,0,0.22)',
          width: 260, maxHeight: 360, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div style={{ padding: '8px 10px 6px', borderBottom: '1px solid var(--c-border2)' }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="태그 검색..."
            style={{
              width: '100%', boxSizing: 'border-box', padding: '5px 10px', borderRadius: 6,
              border: '1px solid var(--c-border3)', background: '#fff', color: '#222',
              fontSize: 13, outline: 'none',
            }}
          />
        </div>

        <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
          {emotionResults.length > 0 && (
            <>
              <div style={{ padding: '4px 12px 2px', fontSize: 10, fontWeight: 600, color: 'var(--c-text6)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--c-tag)' }}>감정태그</div>
              {emotionResults.slice(0, 8).map(em => {
                const sel = isSelected('emotion', em.word);
                return (
                  <div key={em.word}
                    data-tag-selected={sel ? 'true' : 'false'}
                    onMouseDown={e => { e.preventDefault(); onOpenFullPicker(em.word); onClose(); }}
                    onMouseEnter={() => setSelIdx(allItems.findIndex(i => i.kind === 'emotion' && i.em.word === em.word))}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12, color: 'var(--c-text)', background: sel ? 'var(--c-active)' : 'transparent' }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: em.color, flexShrink: 0 }} />
                    {em.word}
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: sel ? 'inherit' : 'var(--c-text6)' }}>{em.categoryLabel}</span>
                  </div>
                );
              })}
            </>
          )}

          {structureResults.length > 0 && (
            <>
              <div style={{ padding: '4px 12px 2px', fontSize: 10, fontWeight: 600, color: 'var(--c-text6)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--c-tag)' }}>구조태그</div>
              {structureResults.slice(0, 8).map(r => {
                const has = currentStructureTags.includes(r.beat);
                const sel = isSelected('structure', r.beat);
                return (
                  <div key={r.beat}
                    data-tag-selected={sel ? 'true' : 'false'}
                    onMouseDown={e => { e.preventDefault(); if (!has) { onAddStructure(r.beat); onClose(); } }}
                    onMouseEnter={() => { if (!has) setSelIdx(allItems.findIndex(i => i.kind === 'structure' && i.r.beat === r.beat)); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', cursor: has ? 'default' : 'pointer', fontSize: 12, color: has ? 'var(--c-text5)' : 'var(--c-text)', opacity: has ? 0.5 : 1, background: sel ? 'var(--c-active)' : 'transparent' }}
                  >
                    <span style={{ width: 8, height: 2, background: r.color, flexShrink: 0, borderRadius: 1 }} />
                    {r.beat}
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--c-text6)' }}>{has ? '✓' : r.guideName.split(' ')[0]}</span>
                  </div>
                );
              })}
            </>
          )}

          {!emotionResults.length && !structureResults.length && !q && (
            <div style={{ padding: '14px', textAlign: 'center', fontSize: 12, color: 'var(--c-text5)' }}>검색어를 입력하세요</div>
          )}

          {q && (() => {
            const sel = isSelected('custom');
            return (
              <div
                data-tag-selected={sel ? 'true' : 'false'}
                onMouseDown={e => { e.preventDefault(); onOpenFullPicker(q); onClose(); }}
                onMouseEnter={() => setSelIdx(allItems.findIndex(i => i.kind === 'custom'))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 12px', cursor: 'pointer', fontSize: 12,
                  color: sel ? 'var(--c-text)' : 'var(--c-text4)',
                  background: sel ? 'var(--c-active)' : 'transparent',
                  borderTop: '1px solid var(--c-border2)',
                }}
              >
                <span style={{ fontSize: 11 }}>✏️</span>
                <span>"{q}" 색상 직접 선택</span>
              </div>
            );
          })()}
        </div>
      </div>
    </>,
    document.body
  );
}
