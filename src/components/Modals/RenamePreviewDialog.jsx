import React, { useState, useMemo, useEffect } from 'react';
import Modal, { ModalBtn } from './Modal';

// ─── 키 헬퍼 ─────────────────────────────────────────────────────────────────
function mk(pairIdx, source, unitId) { return `${pairIdx}::${source}::${unitId}`; }

function getBlockLabel(type) {
  if (type === 'scene_number')  return '씬';
  if (type === 'dialogue')      return '대사';
  if (type === 'action')        return '지문';
  if (type === 'parenthetical') return '괄호체';
  return type;
}

// ─── 컨텍스트 하이라이트 ──────────────────────────────────────────────────────
function HighlightContext({ context }) {
  if (!context) return null;
  return (
    <span>
      {context.before && (
        <span style={{ color: 'var(--c-text4)' }}>
          {context.before.length > 15 ? '…' + context.before.slice(-15) : context.before}
        </span>
      )}
      <mark style={{ background: 'rgba(90,90,245,0.2)', color: 'var(--c-accent)', fontWeight: 600, borderRadius: 2, padding: '0 1px' }}>
        {context.match}
      </mark>
      {context.after && (
        <span style={{ color: 'var(--c-text4)' }}>
          {context.after.length > 15 ? context.after.slice(0, 15) + '…' : context.after}
        </span>
      )}
    </span>
  );
}

// ─── 체크박스 행 ──────────────────────────────────────────────────────────────
function CheckRow({ itemKey, checked, onToggle, label, sublabel, count, context, indent = false }) {
  return (
    <label
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 9,
        padding: '6px 10px', paddingLeft: indent ? 22 : 10,
        borderRadius: 5, cursor: 'pointer',
        background: checked ? 'var(--c-tag)' : 'transparent',
        border: `1px solid ${checked ? 'var(--c-border3)' : 'transparent'}`,
        transition: 'background 60ms',
      }}
      onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'var(--c-hover)'; }}
      onMouseLeave={e => { if (!checked) e.currentTarget.style.background = 'transparent'; }}
    >
      <input
        type="checkbox" checked={checked} onChange={() => onToggle(itemKey)}
        style={{ accentColor: 'var(--c-accent)', width: 13, height: 13, flexShrink: 0, marginTop: 3 }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, color: 'var(--c-text5)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
          {count > 1 && <span style={{ marginLeft: 6, color: 'var(--c-accent2)' }}>({count}개)</span>}
          {sublabel && <span style={{ marginLeft: 6, color: 'var(--c-text5)', fontWeight: 400, textTransform: 'none' }}>{sublabel}</span>}
        </div>
        {context && (
          <div style={{ fontSize: 12, color: 'var(--c-text)', lineHeight: 1.5 }}>
            <HighlightContext context={context} />
          </div>
        )}
      </div>
    </label>
  );
}

// ─── 섹션 헤더 ────────────────────────────────────────────────────────────────
function SectionHeader({ label, count, allChecked, someChecked, onToggle }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
      marginBottom: 3, cursor: 'pointer',
      fontSize: 11, color: 'var(--c-text4)', fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>
      <input
        type="checkbox"
        checked={allChecked}
        ref={el => { if (el) el.indeterminate = !allChecked && someChecked; }}
        onChange={onToggle}
        style={{ accentColor: 'var(--c-accent)', width: 13, height: 13, flexShrink: 0 }}
      />
      {label} <span style={{ color: 'var(--c-text5)', fontWeight: 400 }}>({count}개)</span>
    </label>
  );
}

// ─── 페어 섹션 빌드: 각 source별 키 목록 ─────────────────────────────────────
function getPairKeys(pair) {
  const { pairIdx, blockGroups, synopsisGroups, charIntroGroups, episodeGroups, coverGroups, coverCustomGroups } = pair;
  return [
    ...(blockGroups       || []).map(g => mk(pairIdx, 'block',       g.blockId)),
    ...(synopsisGroups    || []).map(g => mk(pairIdx, 'synopsis',    g.field)),
    ...(charIntroGroups   || []).map(g => mk(pairIdx, 'charIntro',   g.charId)),
    ...(episodeGroups     || []).map(g => mk(pairIdx, 'episode',     g.episodeId)),
    ...(coverGroups       || []).map(g => mk(pairIdx, 'cover',       g.field)),
    ...(coverCustomGroups || []).map(g => mk(pairIdx, 'coverCustom', g.fieldId)),
  ];
}

// pairResults: buildPairResult로 생성된 배열
export default function RenamePreviewDialog({ open, onClose, pairResults = [], onConfirm }) {
  const allKeys = useMemo(() => {
    const s = new Set();
    pairResults.forEach(pair => getPairKeys(pair).forEach(k => s.add(k)));
    return s;
  }, [pairResults]);

  const [checkedKeys, setCheckedKeys] = useState(() => new Set(allKeys));

  useEffect(() => { setCheckedKeys(new Set(allKeys)); }, [allKeys]);

  const totalUnits = allKeys.size;
  const allChecked  = checkedKeys.size === totalUnits;
  const noneChecked = checkedKeys.size === 0;

  const toggleAll = () => setCheckedKeys(allChecked ? new Set() : new Set(allKeys));

  const toggleKey = (key) => setCheckedKeys(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const toggleGroup = (keys) => {
    const allIn = keys.every(k => checkedKeys.has(k));
    setCheckedKeys(prev => {
      const next = new Set(prev);
      if (allIn) keys.forEach(k => next.delete(k));
      else       keys.forEach(k => next.add(k));
      return next;
    });
  };

  const handleConfirm = () => {
    if (checkedKeys.size === 0) return;
    onConfirm(new Set(checkedKeys));
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="변경 미리보기"
      size="lg"
      description="변경될 항목을 확인하고 선택하세요"
      footer={
        <>
          <span style={{ fontSize: 12, color: 'var(--c-text4)', marginRight: 'auto' }}>
            선택: {checkedKeys.size} / {totalUnits}개 항목
          </span>
          <ModalBtn variant="secondary" onClick={onClose}>취소</ModalBtn>
          <ModalBtn variant="primary" disabled={noneChecked} onClick={handleConfirm}>
            선택 항목 변경
          </ModalBtn>
        </>
      }
    >
      {/* 전체 선택 */}
      <label style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
        marginBottom: 12, borderRadius: 5, cursor: 'pointer',
        background: 'var(--c-input)', border: '1px solid var(--c-border3)',
        fontSize: 12, color: 'var(--c-text3)', fontWeight: 500,
      }}>
        <input
          type="checkbox"
          checked={allChecked}
          ref={el => { if (el) el.indeterminate = !allChecked && !noneChecked; }}
          onChange={toggleAll}
          style={{ accentColor: 'var(--c-accent)', width: 14, height: 14, flexShrink: 0 }}
        />
        전체 선택 / 해제
      </label>

      {/* 페어별 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {pairResults.map(pair => {
          const { pairIdx, label, blockGroups = [], synopsisGroups = [], charIntroGroups = [], episodeGroups = [], coverGroups = [], coverCustomGroups = [] } = pair;
          const pairKeys = getPairKeys(pair);
          const allPair  = pairKeys.every(k => checkedKeys.has(k));
          const somePair = pairKeys.some(k => checkedKeys.has(k));

          return (
            <div key={pairIdx}>
              {/* 페어 헤더 */}
              <SectionHeader
                label={label}
                count={pairKeys.length}
                allChecked={allPair}
                someChecked={somePair}
                onToggle={() => toggleGroup(pairKeys)}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 4 }}>

                {/* ── 대본 본문 ─────────────────────────────────────────────── */}
                {blockGroups.length > 0 && (() => {
                  const bKeys = blockGroups.map(g => mk(pairIdx, 'block', g.blockId));
                  const allB  = bKeys.every(k => checkedKeys.has(k));
                  const someB = bKeys.some(k => checkedKeys.has(k));
                  return (
                    <div>
                      <SectionHeader label="대본 본문" count={blockGroups.length} allChecked={allB} someChecked={someB} onToggle={() => toggleGroup(bKeys)} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {blockGroups.map(g => {
                          const key = mk(pairIdx, 'block', g.blockId);
                          const sectionLabel = g.hasCharName ? '인물 블록' : getBlockLabel(g.blockType);
                          return (
                            <CheckRow key={key} itemKey={key} checked={checkedKeys.has(key)} onToggle={toggleKey}
                              label={sectionLabel} count={g.count} context={g.contexts[0]}
                              sublabel={g.count > 1 ? `+${g.count - 1}개 더` : null} indent />
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* ── 시놉시스 ──────────────────────────────────────────────── */}
                {synopsisGroups.length > 0 && (() => {
                  const sKeys = synopsisGroups.map(g => mk(pairIdx, 'synopsis', g.field));
                  const allS  = sKeys.every(k => checkedKeys.has(k));
                  const someS = sKeys.some(k => checkedKeys.has(k));
                  return (
                    <div>
                      <SectionHeader label="시놉시스" count={synopsisGroups.length} allChecked={allS} someChecked={someS} onToggle={() => toggleGroup(sKeys)} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {synopsisGroups.map(g => {
                          const key = mk(pairIdx, 'synopsis', g.field);
                          return (
                            <CheckRow key={key} itemKey={key} checked={checkedKeys.has(key)} onToggle={toggleKey}
                              label={g.fieldLabel} count={g.count} context={g.contexts[0]} indent />
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* ── 인물 소개 ─────────────────────────────────────────────── */}
                {charIntroGroups.length > 0 && (() => {
                  const cKeys = charIntroGroups.map(g => mk(pairIdx, 'charIntro', g.charId));
                  const allC  = cKeys.every(k => checkedKeys.has(k));
                  const someC = cKeys.some(k => checkedKeys.has(k));
                  return (
                    <div>
                      <SectionHeader label="인물 소개" count={charIntroGroups.length} allChecked={allC} someChecked={someC} onToggle={() => toggleGroup(cKeys)} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {charIntroGroups.map(g => {
                          const key = mk(pairIdx, 'charIntro', g.charId);
                          return (
                            <CheckRow key={key} itemKey={key} checked={checkedKeys.has(key)} onToggle={toggleKey}
                              label={g.charName || '인물'} count={g.count} context={g.contexts[0]} indent />
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* ── 트리트먼트 ────────────────────────────────────────────── */}
                {episodeGroups.length > 0 && (() => {
                  const eKeys = episodeGroups.map(g => mk(pairIdx, 'episode', g.episodeId));
                  const allE  = eKeys.every(k => checkedKeys.has(k));
                  const someE = eKeys.some(k => checkedKeys.has(k));
                  return (
                    <div>
                      <SectionHeader label="트리트먼트" count={episodeGroups.length} allChecked={allE} someChecked={someE} onToggle={() => toggleGroup(eKeys)} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {episodeGroups.map(g => {
                          const key = mk(pairIdx, 'episode', g.episodeId);
                          const epLabel = `${g.epNum}화${g.epTitle ? ` "${g.epTitle}"` : ''}`;
                          return (
                            <CheckRow key={key} itemKey={key} checked={checkedKeys.has(key)} onToggle={toggleKey}
                              label={epLabel} count={g.count} context={g.contexts[0]} indent />
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* ── 표지 ──────────────────────────────────────────────────── */}
                {(coverGroups.length > 0 || coverCustomGroups.length > 0) && (() => {
                  const cvKeys = [
                    ...coverGroups.map(g => mk(pairIdx, 'cover', g.field)),
                    ...coverCustomGroups.map(g => mk(pairIdx, 'coverCustom', g.fieldId)),
                  ];
                  const allCv  = cvKeys.every(k => checkedKeys.has(k));
                  const someCv = cvKeys.some(k => checkedKeys.has(k));
                  return (
                    <div>
                      <SectionHeader label="표지" count={cvKeys.length} allChecked={allCv} someChecked={someCv} onToggle={() => toggleGroup(cvKeys)} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {coverGroups.map(g => {
                          const key = mk(pairIdx, 'cover', g.field);
                          return <CheckRow key={key} itemKey={key} checked={checkedKeys.has(key)} onToggle={toggleKey} label={g.fieldLabel} count={g.count} context={g.contexts[0]} indent />;
                        })}
                        {coverCustomGroups.map(g => {
                          const key = mk(pairIdx, 'coverCustom', g.fieldId);
                          return <CheckRow key={key} itemKey={key} checked={checkedKeys.has(key)} onToggle={toggleKey} label={`커스텀: ${g.fieldLabel}`} count={g.count} context={g.contexts[0]} indent />;
                        })}
                      </div>
                    </div>
                  );
                })()}

              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
