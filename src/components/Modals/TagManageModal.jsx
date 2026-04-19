import React, { useState } from 'react';
import Modal from './Modal';
import { useApp } from '../../store/AppContext';
import { BUILTIN_GUIDES } from '../../data/structureTags';
import { EMOTION_CATEGORIES } from '../../data/emotionTags';

const EMOTION_COLORS = [
  '#FFD600','#FF6B9D','#4FC3F7','#81C784','#FF7043',
  '#AB47BC','#78909C','#26C6DA','#FFA726','#EC407A',
];

const DEFAULT_SYMBOLS = ['(E)', '(F)', 'Flashback', 'Insert', 'Ins.', 'Subtitle)', 'S.T.', '(N)', 'N.A.'];

const tabStyle = (active) => ({
  padding: '6px 16px', fontSize: 13, cursor: 'pointer', border: 'none', background: 'none',
  borderBottom: active ? '2px solid var(--c-accent)' : '2px solid transparent',
  color: active ? 'var(--c-accent)' : 'var(--c-text5)',
  fontWeight: active ? 600 : 400,
  flexShrink: 0,
});

// ─── 구조태그 탭 ──────────────────────────────────────────────────────────────
function StructureTagTab() {
  const { state, dispatch } = useApp();
  const custom = state.stylePreset?.customStructureTags || [];
  const [input, setInput] = useState('');

  const save = (arr) => dispatch({ type: 'SET_STYLE_PRESET', payload: { customStructureTags: arr } });

  const add = () => {
    const s = input.trim();
    if (!s) return;
    const allBeats = BUILTIN_GUIDES.flatMap(g => g.beats);
    if (custom.includes(s) || allBeats.includes(s)) return;
    save([...custom, s]);
    setInput('');
  };

  const remove = (tag) => save(custom.filter(t => t !== tag));
  const move = (tag, dir) => {
    const idx = custom.indexOf(tag);
    const next = dir === 'up' ? idx - 1 : idx + 1;
    if (next < 0 || next >= custom.length) return;
    const arr = [...custom];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    save(arr);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="text-xs" style={{ color: 'var(--c-text5)', lineHeight: 1.6 }}>
        씬에 붙일 구조태그입니다. 대본 편집 중 태그 버튼(Ctrl+Shift+7)을 누르면 아래 태그가 검색 목록에 나타납니다.
      </div>

      {/* 기본 제공 가이드 */}
      {BUILTIN_GUIDES.map(guide => (
        <div key={guide.id}>
          <div style={{ fontSize: 11, fontWeight: 600, color: guide.color, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: guide.color, display: 'inline-block' }} />
            {guide.name}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {guide.beats.map(beat => (
              <span key={beat} style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 12,
                background: 'var(--c-input)', color: 'var(--c-text3)',
                border: `1px solid ${guide.color}44`,
              }}>{beat}</span>
            ))}
          </div>
        </div>
      ))}

      {/* 구분선 */}
      <div style={{ height: 1, background: 'var(--c-border)' }} />

      {/* 커스텀 태그 */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text3)', marginBottom: 8 }}>
          내 구조태그 {custom.length > 0 && <span style={{ color: 'var(--c-text6)', fontWeight: 400 }}>({custom.length})</span>}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); }}
            placeholder="새 구조태그 입력 후 Enter"
            style={{ flex: 1, fontSize: 12, padding: '5px 10px', borderRadius: 6, background: 'var(--c-input)', color: 'var(--c-text)', border: '1px solid var(--c-border3)', outline: 'none' }}
          />
          <button onClick={add} style={{ padding: '5px 14px', borderRadius: 6, fontSize: 12, background: 'var(--c-accent)', color: '#fff', border: 'none', cursor: 'pointer', flexShrink: 0 }}>추가</button>
        </div>

        {custom.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 12, color: 'var(--c-text6)' }}>추가된 태그가 없습니다.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {custom.map((tag, idx) => (
              <div key={tag} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: 'var(--c-input)', border: '1px solid var(--c-border3)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                  <button onClick={() => move(tag, 'up')} disabled={idx === 0} style={{ fontSize: 9, padding: '1px 4px', border: '1px solid var(--c-border3)', borderRadius: 3, background: 'transparent', color: idx === 0 ? 'var(--c-text6)' : 'var(--c-text4)', cursor: idx === 0 ? 'default' : 'pointer' }}>▲</button>
                  <button onClick={() => move(tag, 'down')} disabled={idx === custom.length - 1} style={{ fontSize: 9, padding: '1px 4px', border: '1px solid var(--c-border3)', borderRadius: 3, background: 'transparent', color: idx === custom.length - 1 ? 'var(--c-text6)' : 'var(--c-text4)', cursor: idx === custom.length - 1 ? 'default' : 'pointer' }}>▼</button>
                </div>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--c-text2)' }}>{tag}</span>
                <button onClick={() => remove(tag)} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, border: '1px solid #f99', background: 'transparent', color: '#c55', cursor: 'pointer', flexShrink: 0 }}>삭제</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 감정태그 탭 ──────────────────────────────────────────────────────────────
function EmotionTagTab() {
  const { state, dispatch } = useApp();
  const custom = state.stylePreset?.customEmotionTags || [];
  const [input, setInput] = useState('');
  const [color, setColor] = useState(EMOTION_COLORS[0]);

  const save = (arr) => dispatch({ type: 'SET_STYLE_PRESET', payload: { customEmotionTags: arr } });

  const add = () => {
    const w = input.trim();
    if (!w) return;
    const allWords = EMOTION_CATEGORIES.flatMap(c => c.groups.flatMap(g => g.emotions.map(e => e.word)));
    if (custom.some(t => t.word === w) || allWords.includes(w)) return;
    save([...custom, { word: w, color }]);
    setInput('');
  };

  const remove = (word) => save(custom.filter(t => t.word !== word));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="text-xs" style={{ color: 'var(--c-text5)', lineHeight: 1.6 }}>
        씬에 붙일 감정태그입니다. 태그 버튼을 눌러 검색할 때 기본 감정어 목록과 함께 나타납니다.
      </div>

      {/* 기본 감정 카테고리 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {EMOTION_CATEGORIES.map(cat => (
          <div key={cat.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: cat.color, minWidth: 36, marginTop: 2 }}>{cat.label}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, flex: 1 }}>
              {cat.groups.flatMap(g => g.emotions).slice(0, 8).map(em => (
                <span key={em.word} style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: `${cat.color}22`, color: 'var(--c-text3)', border: `1px solid ${cat.color}44` }}>{em.word}</span>
              ))}
              {cat.groups.flatMap(g => g.emotions).length > 8 && (
                <span style={{ fontSize: 10, color: 'var(--c-text6)', padding: '1px 4px' }}>+{cat.groups.flatMap(g => g.emotions).length - 8}개 더</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: 'var(--c-border)' }} />

      {/* 커스텀 감정태그 */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text3)', marginBottom: 8 }}>
          내 감정태그 {custom.length > 0 && <span style={{ color: 'var(--c-text6)', fontWeight: 400 }}>({custom.length})</span>}
        </div>

        {/* 입력 행 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); }}
            placeholder="새 감정어 입력 후 Enter"
            style={{ flex: 1, fontSize: 12, padding: '5px 10px', borderRadius: 6, background: 'var(--c-input)', color: 'var(--c-text)', border: '1px solid var(--c-border3)', outline: 'none' }}
          />
          {/* 색상 선택 */}
          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
            {EMOTION_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{
                width: 16, height: 16, borderRadius: '50%', background: c, border: color === c ? '2px solid var(--c-text)' : '2px solid transparent',
                cursor: 'pointer', flexShrink: 0, padding: 0,
              }} />
            ))}
          </div>
          <button onClick={add} style={{ padding: '5px 14px', borderRadius: 6, fontSize: 12, background: 'var(--c-accent)', color: '#fff', border: 'none', cursor: 'pointer', flexShrink: 0 }}>추가</button>
        </div>

        {custom.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 12, color: 'var(--c-text6)' }}>추가된 감정태그가 없습니다.</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {custom.map(t => (
              <span key={t.word} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '3px 10px', borderRadius: 12, background: `${t.color}22`, border: `1px solid ${t.color}66`, color: 'var(--c-text2)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                {t.word}
                <button onClick={() => remove(t.word)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text6)', fontSize: 11, lineHeight: 1, padding: '0 0 0 2px' }}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 기타 단축어 탭 ───────────────────────────────────────────────────────────
function SymbolTab() {
  const { state, dispatch } = useApp();
  const custom = state.stylePreset?.customSymbols || [];
  const [input, setInput] = useState('');

  const allSymbols = custom.length > 0 ? custom : [...DEFAULT_SYMBOLS];

  const save = (arr) => dispatch({ type: 'SET_STYLE_PRESET', payload: { customSymbols: arr } });

  const add = () => {
    const s = input.trim();
    if (!s) return;
    if (!allSymbols.includes(s)) save([...allSymbols, s]);
    setInput('');
  };

  const remove = (sym) => save(allSymbols.filter(s => s !== sym));

  const move = (sym, dir) => {
    const idx = allSymbols.indexOf(sym);
    const next = dir === 'up' ? idx - 1 : idx + 1;
    if (next < 0 || next >= allSymbols.length) return;
    const arr = [...allSymbols];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    save(arr);
  };

  const reset = () => dispatch({ type: 'SET_STYLE_PRESET', payload: { customSymbols: [] } });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="text-xs" style={{ color: 'var(--c-text5)', lineHeight: 1.6 }}>
        대본 편집 중 기타(Ctrl+Shift+6)를 누르면 아래 목록이 나타납니다. 목록을 수정하면 자동으로 반영됩니다.
      </div>

      {/* 기본 목록 안내 */}
      {custom.length === 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {DEFAULT_SYMBOLS.map(s => (
            <span key={s} style={{ fontSize: 12, padding: '2px 10px', borderRadius: 12, background: 'var(--c-input)', color: 'var(--c-text3)', border: '1px solid var(--c-border3)' }}>{s}</span>
          ))}
        </div>
      )}

      <div style={{ height: 1, background: 'var(--c-border)' }} />

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text3)' }}>
            단축어 목록 {custom.length > 0 && <span style={{ color: 'var(--c-text6)', fontWeight: 400 }}>({allSymbols.length})</span>}
          </div>
          {custom.length > 0 && (
            <button onClick={reset} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--c-border3)', background: 'transparent', color: 'var(--c-text5)', cursor: 'pointer' }}>초기화</button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); }}
            placeholder="새 단축어 입력 후 Enter"
            style={{ flex: 1, fontSize: 12, padding: '5px 10px', borderRadius: 6, background: 'var(--c-input)', color: 'var(--c-text)', border: '1px solid var(--c-border3)', outline: 'none' }}
          />
          <button onClick={add} style={{ padding: '5px 14px', borderRadius: 6, fontSize: 12, background: 'var(--c-accent)', color: '#fff', border: 'none', cursor: 'pointer', flexShrink: 0 }}>추가</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {allSymbols.map((sym, idx) => (
            <div key={sym} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: 'var(--c-input)', border: '1px solid var(--c-border3)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                <button onClick={() => move(sym, 'up')} disabled={idx === 0} style={{ fontSize: 9, padding: '1px 4px', border: '1px solid var(--c-border3)', borderRadius: 3, background: 'transparent', color: idx === 0 ? 'var(--c-text6)' : 'var(--c-text4)', cursor: idx === 0 ? 'default' : 'pointer' }}>▲</button>
                <button onClick={() => move(sym, 'down')} disabled={idx === allSymbols.length - 1} style={{ fontSize: 9, padding: '1px 4px', border: '1px solid var(--c-border3)', borderRadius: 3, background: 'transparent', color: idx === allSymbols.length - 1 ? 'var(--c-text6)' : 'var(--c-text4)', cursor: idx === allSymbols.length - 1 ? 'default' : 'pointer' }}>▼</button>
              </div>
              <span style={{ flex: 1, fontSize: 13, color: 'var(--c-text2)' }}>{sym}</span>
              <button onClick={() => remove(sym)} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, border: '1px solid #f99', background: 'transparent', color: '#c55', cursor: 'pointer', flexShrink: 0 }}>삭제</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 메인 모달 ────────────────────────────────────────────────────────────────
export default function TagManageModal({ open, onClose }) {
  const [tab, setTab] = useState('structure');

  return (
    <Modal open={open} onClose={onClose} title="태그 / 기타 단축어" size="md" description="구조태그 및 감정태그 관리">
      <div style={{ display: 'flex', borderBottom: '1px solid var(--c-border)', marginBottom: 16, marginTop: -4 }}>
        <button style={tabStyle(tab === 'structure')} onClick={() => setTab('structure')}>구조태그</button>
        <button style={tabStyle(tab === 'emotion')}   onClick={() => setTab('emotion')}>감정태그</button>
        <button style={tabStyle(tab === 'symbol')}    onClick={() => setTab('symbol')}>기타 단축어</button>
      </div>
      <div style={{ overflowY: 'auto', maxHeight: 420, paddingRight: 2 }}>
        {tab === 'structure' && <StructureTagTab />}
        {tab === 'emotion'   && <EmotionTagTab />}
        {tab === 'symbol'    && <SymbolTab />}
      </div>
    </Modal>
  );
}
