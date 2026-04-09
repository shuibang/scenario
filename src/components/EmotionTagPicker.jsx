import React, { useState, useMemo, useRef, useEffect } from 'react';
import { EMOTION_CATEGORIES, ALL_EMOTIONS, getRecommendedTag } from '../data/emotionTags';
import { getChipInlineStyle } from '../utils/emotionColor';

/**
 * EmotionTagPicker — 3단계 감정태그 선택 UI
 *
 * Props:
 *   onSelect(emotionTag)  — 선택 완료 시 { word, color, intensity } 전달
 *   onClose()             — 닫기
 *   initialWord?          — 초기 단어 (슬래시 팝업에서 넘길 때)
 *   existingTag?          — 수정 시 기존 태그 ({ word, color, intensity })
 */
export default function EmotionTagPicker({ onSelect, onClose, initialWord = '', existingTag = null }) {
  const _initRec = initialWord && !existingTag ? getRecommendedTag(initialWord) : null;
  const [step, setStep] = useState(existingTag ? 2 : (initialWord ? 2 : 1));
  const [query, setQuery] = useState(existingTag?.word ?? initialWord);
  const [selectedWord, setSelectedWord] = useState(existingTag?.word ?? (initialWord || ''));
  const [selectedColor, setSelectedColor] = useState(existingTag?.color ?? _initRec?.color ?? '');
  const [selectedIntensity, setSelectedIntensity] = useState(existingTag?.intensity ?? _initRec?.score ?? 3);
  const searchRef = useRef(null);
  const colorContainerRef = useRef(null);

  // step 1 진입 시 검색창 포커스
  useEffect(() => {
    if (step === 1 && searchRef.current) {
      searchRef.current.focus();
    }
    if (step === 2 && colorContainerRef.current) {
      colorContainerRef.current.focus();
    }
  }, [step]);

  // 단어 목록 필터링
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_EMOTIONS.slice(0, 30);
    return ALL_EMOTIONS.filter((e) => e.word.includes(q));
  }, [query]);

  function handleWordSelect(word) {
    const rec = getRecommendedTag(word);
    setSelectedWord(word);
    setSelectedColor(rec.color);
    setSelectedIntensity(rec.score);
    setStep(2);
  }

  function handleCustomWord() {
    const w = query.trim();
    if (!w) return;
    setSelectedWord(w);
    setSelectedColor(existingTag?.color || '#9E9E9E');
    setSelectedIntensity(existingTag?.intensity || 3);
    setStep(2);
  }

  function handleConfirm() {
    onSelect({ word: selectedWord, color: selectedColor, intensity: selectedIntensity });
  }

  const chipPreview = selectedWord
    ? getChipInlineStyle(selectedColor || '#9E9E9E', selectedIntensity)
    : null;

  return (
    <div
      className="emotion-tag-picker"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        width: 280,
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: 12,
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* 헤더 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px 8px',
        borderBottom: '1px solid #f0f0f0',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>
          {step === 1 ? '감정 단어 검색' : step === 2 ? '색상 선택' : '강도 선택'}
        </span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 16, lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      {/* Step 1: 단어 선택 */}
      {step === 1 && (
        <div style={{ padding: '10px 12px' }}>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (filtered.length > 0) handleWordSelect(filtered[0].word);
                else handleCustomWord();
              }
            }}
            placeholder="감정 단어 검색..."
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '6px 10px',
              border: '1px solid #ddd',
              borderRadius: 8,
              fontSize: 13,
              outline: 'none',
              color: '#222',
              background: '#fff',
            }}
          />
          <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 6 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '6px 4px', color: '#999', fontSize: 12 }}>
                목록에 없는 단어예요.{' '}
                <button
                  onClick={handleCustomWord}
                  style={{ background: 'none', border: 'none', color: '#555', textDecoration: 'underline', cursor: 'pointer', fontSize: 12 }}
                >
                  "{query.trim()}" 직접 입력
                </button>
              </div>
            ) : (
              filtered.map((em) => (
                <div
                  key={em.word}
                  onClick={() => handleWordSelect(em.word)}
                  style={{
                    padding: '5px 6px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 13,
                    color: '#333',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f5f5f5'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span
                    style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: em.color, flexShrink: 0,
                    }}
                  />
                  {em.word}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: '#aaa' }}>{em.categoryLabel}</span>
                </div>
              ))
            )}
          </div>
          {query.trim() && filtered.length > 0 && (
            <button
              onClick={handleCustomWord}
              style={{
                marginTop: 4, width: '100%', padding: '5px', border: '1px dashed #ccc',
                borderRadius: 6, background: 'none', cursor: 'pointer', fontSize: 12, color: '#777',
              }}
            >
              "{query.trim()}" 직접 입력하기
            </button>
          )}
        </div>
      )}

      {/* Step 2: 색상 선택 */}
      {step === 2 && (() => {
        const COLS = 5; // 한 행에 5개 (5×40px=200px, 256px 유효폭 안에 여유롭게 들어감)
        const total = EMOTION_CATEGORIES.length;
        const colorIdx = selectedColor ? EMOTION_CATEGORIES.findIndex(c => c.color === selectedColor) : 0;
        const handleColorKeyDown = (e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            setSelectedColor(EMOTION_CATEGORIES[(colorIdx + 1) % total].color);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setSelectedColor(EMOTION_CATEGORIES[(colorIdx - 1 + total) % total].color);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = colorIdx + COLS;
            setSelectedColor(EMOTION_CATEGORIES[Math.min(next, total - 1)].color);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = colorIdx - COLS;
            setSelectedColor(EMOTION_CATEGORIES[Math.max(prev, 0)].color);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedColor) setStep(3);
          }
        };
        return (
        <div style={{ padding: '12px' }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, color: '#333' }}>{selectedWord}</span>의 색상 선택
          </div>
          <div
            ref={colorContainerRef}
            tabIndex={0}
            onKeyDown={handleColorKeyDown}
            style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', outline: 'none' }}
          >
            {EMOTION_CATEGORIES.map((cat) => (
              <button
                key={cat.color}
                onClick={() => { setSelectedColor(cat.color); setStep(3); }}
                title={cat.label}
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: cat.color,
                  border: selectedColor === cat.color ? '3px solid #333' : '2px solid transparent',
                  cursor: 'pointer',
                  boxShadow: selectedColor === cat.color ? '0 0 0 2px #fff inset' : 'none',
                  outline: 'none',
                  transition: 'transform 0.1s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button onClick={() => setStep(1)} style={backBtnStyle}>← 단어</button>
            {selectedColor && (
              <button onClick={() => setStep(3)} style={nextBtnStyle}>강도 선택 →</button>
            )}
          </div>
        </div>
        );
      })()}

      {/* Step 3: 강도 선택 */}
      {step === 3 && (() => {
        const intensityContainerRef2 = { current: null };
        return (
        <div style={{ padding: '12px' }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>강도 선택 (1 = 연함, 5 = 진함)</div>
          <div
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') { e.preventDefault(); setSelectedIntensity(n => Math.min(n + 1, 5)); }
              else if (e.key === 'ArrowLeft') { e.preventDefault(); setSelectedIntensity(n => Math.max(n - 1, 1)); }
              else if (e.key === 'Enter') { e.preventDefault(); handleConfirm(); }
            }}
            style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 12, outline: 'none' }}
            ref={(el) => { if (el && step === 3) setTimeout(() => el.focus(), 0); }}
          >
            {[1, 2, 3, 4, 5].map((n) => {
              const s = getChipInlineStyle(selectedColor, n);
              return (
                <button
                  key={n}
                  onClick={() => setSelectedIntensity(n)}
                  style={{
                    ...s,
                    width: 36, height: 36,
                    borderRadius: '50%',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: 13,
                    outline: selectedIntensity === n ? '2px solid #333' : 'none',
                    outlineOffset: 2,
                    transition: 'transform 0.1s',
                    padding: 0,
                    justifyContent: 'center',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  {n}
                </button>
              );
            })}
          </div>

          {/* 미리보기 */}
          {chipPreview && (
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: '#aaa', marginRight: 6 }}>미리보기</span>
              <span style={{ ...chipPreview, fontSize: '13px', padding: '3px 10px', borderRadius: '8px' }}>{selectedWord}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setStep(2)} style={backBtnStyle}>← 색상</button>
            <button onClick={handleConfirm} style={confirmBtnStyle}>저장</button>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

const backBtnStyle = {
  flex: 1, padding: '6px', border: '1px solid #ddd', borderRadius: 8,
  background: '#fafafa', cursor: 'pointer', fontSize: 12, color: '#666',
};
const nextBtnStyle = {
  flex: 2, padding: '6px', border: 'none', borderRadius: 8,
  background: '#333', cursor: 'pointer', fontSize: 12, color: '#fff', fontWeight: 600,
};
const confirmBtnStyle = {
  flex: 2, padding: '6px', border: 'none', borderRadius: 8,
  background: '#333', cursor: 'pointer', fontSize: 12, color: '#fff', fontWeight: 600,
};
