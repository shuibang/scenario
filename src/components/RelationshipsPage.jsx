import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useApp } from '../store/AppContext';
import { charDisplayName, getCharRoles, getRoleColor, getRoleLabel } from './CharacterPanel';
import { genId } from '../store/db';
import {
  NODE_W, NODE_H, CANVAS_H,
  autoPositions, clampPos, isValidPos, mergePositions, samePositions,
} from '../utils/relationshipLayout';

const ARROW_LEN = 10; // arrowhead length offset

// ─── Rectangle border intersection ────────────────────────────────────────────
function rectEdge(cx, cy, nx, ny) {
  const HW = NODE_W / 2;
  const HH = NODE_H / 2;
  const absDx = Math.abs(nx);
  const absDy = Math.abs(ny);
  const t = Math.min(
    absDx > 0.001 ? HW / absDx : Infinity,
    absDy > 0.001 ? HH / absDy : Infinity,
  );
  return { x: cx + nx * t, y: cy + ny * t };
}

// ─── EdgeArrow ─────────────────────────────────────────────────────────────────
function EdgeArrow({ from, to, label, sideOffset = 0 }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 2) return null;
  const nx = dx / dist;
  const ny = dy / dist;

  // Perpendicular unit vector (rotate 90°)
  const perpX = -ny * sideOffset;
  const perpY =  nx * sideOffset;

  const p1raw = rectEdge(from.x, from.y, nx, ny);
  const p2raw = rectEdge(to.x, to.y, -nx, -ny);

  const p1 = { x: p1raw.x + perpX, y: p1raw.y + perpY };
  const x2  = p2raw.x - nx * ARROW_LEN + perpX;
  const y2  = p2raw.y - ny * ARROW_LEN + perpY;

  // Skip if line would be too short
  const lineDist = Math.sqrt((x2 - p1.x) ** 2 + (y2 - p1.y) ** 2);
  if (lineDist < 4) return null;

  const mx = (p1.x + x2) / 2;
  const my = (p1.y + y2) / 2;
  // Label offset: perpendicular to line, opposite side from sideOffset
  const lx = -ny * (sideOffset !== 0 ? Math.sign(sideOffset) * 12 : 12);
  const ly =  nx * (sideOffset !== 0 ? Math.sign(sideOffset) * 12 : 12);
  const lw = label ? Math.max(label.length * 6 + 10, 24) : 0;

  return (
    <g>
      <line
        x1={p1.x} y1={p1.y} x2={x2} y2={y2}
        stroke="var(--c-accent)" strokeWidth="1.5" opacity="0.55"
        markerEnd="url(#rel-arrowhead)"
      />
      {label && (
        <>
          <rect
            x={mx + lx - lw / 2} y={my + ly - 8}
            width={lw} height={14} rx="3"
            fill="var(--c-input)" opacity="0.9"
          />
          <text
            x={mx + lx} y={my + ly + 2}
            textAnchor="middle"
            fontSize="10" fill="var(--c-text4)"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            {label}
          </text>
        </>
      )}
    </g>
  );
}

// ─── CharNode ──────────────────────────────────────────────────────────────────
// 카드 자체는 NODE_W × NODE_H 고정(엣지 계산 일관성 유지).
// 다중 역할 칩은 카드 아래로 별도 줄로 배치 — 노드 위치(pos)에는 영향 없음.
function CharNode({ char, pos, onDragStart, printMode }) {
  const initial = charDisplayName(char).charAt(0) || '?';
  const roles = getCharRoles(char);
  return (
    <div
      style={{
        position: 'absolute',
        left: pos.x - NODE_W / 2,
        top: pos.y - NODE_H / 2,
        width: NODE_W,
        userSelect: 'none',
        pointerEvents: 'none', // 자식 카드만 mouseDown 받도록
      }}
    >
      <div
        onPointerDown={!printMode ? (e) => onDragStart(char.id, e) : undefined}
        style={{
          height: NODE_H,
          touchAction: 'none', // 모바일: 드래그가 페이지 스크롤로 먹히지 않게
          background: 'var(--c-card)',
          border: '1.5px solid var(--c-border2)',
          borderRadius: '8px',
          cursor: printMode ? 'default' : 'grab',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px 8px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.10)',
          gap: '2px',
          pointerEvents: 'auto',
        }}
      >
        <div style={{
          width: 26, height: 26, borderRadius: '50%',
          background: 'var(--c-accent)', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', color: '#fff', fontWeight: 700,
        }}>
          {initial}
        </div>
        <div style={{
          fontSize: '11px', fontWeight: 600, color: 'var(--c-text)',
          textAlign: 'center', lineHeight: 1.2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          width: '100%',
        }}>
          {charDisplayName(char)}
        </div>
      </div>
      {roles.length > 0 && (
        <div style={{
          marginTop: 4,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 2,
        }}>
          {roles.map((r) => (
            <span
              key={r}
              style={{
                fontSize: 8.5, lineHeight: 1.3,
                padding: '1px 6px',
                borderRadius: 6,
                background: 'var(--c-card)',
                color: getRoleColor(r),
                border: `1px solid ${getRoleColor(r)}`,
                whiteSpace: 'nowrap',
              }}
            >
              {getRoleLabel(r)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── GraphCanvas ───────────────────────────────────────────────────────────────
function GraphCanvas({ chars, edges, positions, containerRef, onDragStart, printMode }) {
  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: CANVAS_H,
        background: 'var(--c-bg)',
        borderRadius: '8px',
        border: '1px solid var(--c-border)',
        overflow: 'hidden',
      }}
    >
      {/* SVG arrow layer */}
      <svg
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          pointerEvents: 'none', overflow: 'visible',
        }}
      >
        <defs>
          <marker
            id="rel-arrowhead" markerWidth="8" markerHeight="6"
            refX="8" refY="3" orient="auto"
          >
            <path d="M0,0 L8,3 L0,6 Z" fill="var(--c-accent)" opacity="0.7" />
          </marker>
        </defs>
        {(() => {
          const pairSet = new Set(edges.map(e => `${e.fromId}→${e.toId}`));
          return edges.map(edge => {
            const from = positions[edge.fromId];
            const to   = positions[edge.toId];
            if (!from || !to) return null;
            const hasPair = pairSet.has(`${edge.toId}→${edge.fromId}`);
            // 쌍방이면 각각 +8 / -8px 옆으로 분리
            const sideOffset = hasPair ? 8 : 0;
            return <EdgeArrow key={edge.id} from={from} to={to} label={edge.label} sideOffset={sideOffset} />;
          });
        })()}
      </svg>

      {/* Character nodes */}
      {chars.map(char => {
        const pos = positions[char.id];
        if (!pos) return null;
        return (
          <CharNode
            key={char.id}
            char={char}
            pos={pos}
            onDragStart={onDragStart}
            printMode={printMode}
          />
        );
      })}
    </div>
  );
}

// ─── EditView ──────────────────────────────────────────────────────────────────
function EditView({ projectChars, allEdges, onAdd, onUpdate, onRemove }) {
  const [newFrom, setNewFrom] = useState(projectChars[0]?.id || '');
  const [newTo, setNewTo] = useState('');
  const [newLabel, setNewLabel] = useState('');

  useEffect(() => {
    if (!newFrom && projectChars[0]) setNewFrom(projectChars[0].id);
  }, [projectChars]);
  useEffect(() => {
    // Reset newTo whenever newFrom changes or newTo collides with newFrom
    const other = projectChars.find(c => c.id !== newFrom);
    if (other && (!newTo || newTo === newFrom)) setNewTo(other.id);
  }, [newFrom, projectChars]); // eslint-disable-line react-hooks/exhaustive-deps

  const [addError, setAddError] = useState('');

  const inp = {
    background: 'var(--c-input)', color: 'var(--c-text)',
    border: '1px solid var(--c-border3)', borderRadius: '6px',
    outline: 'none', padding: '4px 8px', fontSize: '13px',
  };

  const handleAdd = () => {
    setAddError('');
    if (!newFrom) { setAddError('출발 인물을 선택하세요.'); return; }
    if (!newTo)   { setAddError('도착 인물을 선택하세요.'); return; }
    if (newFrom === newTo) { setAddError('같은 인물끼리는 관계를 추가할 수 없습니다.'); return; }
    onAdd(newFrom, newTo, newLabel);
    setNewLabel('');
    setAddError('');
  };

  return (
    <div className="px-6 py-4 max-w-2xl">
      {/* Edge list */}
      <div className="space-y-2 mb-4">
        {allEdges.length === 0 && (
          <div className="text-center py-6 text-xs" style={{ color: 'var(--c-text6)' }}>
            등록된 관계가 없습니다. 아래에서 추가하세요.
          </div>
        )}
        {allEdges.map(edge => {
          const fromChar = projectChars.find(c => c.id === edge.fromId);
          return (
            <div key={edge.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <select
                value={edge.fromId}
                onChange={e => onUpdate(edge.fromId, edge.id, 'fromId_move', e.target.value)}
                style={{ ...inp, width: '7em' }}
                disabled
              >
                {projectChars.map(c => (
                  <option key={c.id} value={c.id}>{charDisplayName(c)}</option>
                ))}
              </select>
              <span style={{ color: 'var(--c-text5)', fontSize: '12px' }}>→</span>
              <input
                value={edge.label}
                onChange={e => onUpdate(edge.fromId, edge.id, 'label', e.target.value)}
                placeholder="관계명"
                style={{ ...inp, flex: 1 }}
              />
              <span style={{ color: 'var(--c-text5)', fontSize: '12px' }}>→</span>
              <select
                value={edge.toId}
                onChange={e => onUpdate(edge.fromId, edge.id, 'targetId', e.target.value)}
                style={{ ...inp, width: '7em' }}
              >
                {projectChars.filter(c => c.id !== edge.fromId).map(c => (
                  <option key={c.id} value={c.id}>{charDisplayName(c)}</option>
                ))}
              </select>
              <button
                onClick={() => onRemove(edge.fromId, edge.id)}
                style={{ color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', flexShrink: 0 }}
              >✕</button>
            </div>
          );
        })}
      </div>

      {/* Add row */}
      {projectChars.length >= 2 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          borderTop: '1px solid var(--c-border)', paddingTop: '12px',
        }}>
          <select value={newFrom} onChange={e => setNewFrom(e.target.value)} style={{ ...inp, width: '7em' }}>
            {projectChars.map(c => <option key={c.id} value={c.id}>{charDisplayName(c)}</option>)}
          </select>
          <span style={{ color: 'var(--c-text5)', fontSize: '12px' }}>→</span>
          <input
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="관계명 (예: 연인)"
            style={{ ...inp, flex: 1 }}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <span style={{ color: 'var(--c-text5)', fontSize: '12px' }}>→</span>
          <select
            value={newTo}
            onChange={e => setNewTo(e.target.value)}
            style={{ ...inp, width: '7em' }}
          >
            {projectChars.filter(c => c.id !== newFrom).map(c => (
              <option key={c.id} value={c.id}>{charDisplayName(c)}</option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            style={{
              padding: '4px 12px', borderRadius: '6px', fontSize: '12px',
              background: 'var(--c-accent)', color: '#fff', border: 'none',
              cursor: 'pointer', flexShrink: 0,
            }}
          >추가</button>
        </div>
      )}

      {addError && (
        <div className="mt-2 text-xs px-2 py-1 rounded" style={{ color: '#c00', background: '#fee' }}>
          {addError}
        </div>
      )}

      {projectChars.length < 2 && (
        <div className="text-center py-8 text-xs" style={{ color: 'var(--c-text6)' }}>
          인물을 2명 이상 등록하면 관계를 설정할 수 있습니다
        </div>
      )}
    </div>
  );
}

// ─── RelationshipsPage ─────────────────────────────────────────────────────────
export default function RelationshipsPage() {
  const { state, dispatch } = useApp();
  const { characters, activeProjectId } = state;

  // 매 렌더 새 배열이 되면 allEdges useMemo와 좌표 초기화 effect가 매 렌더 재실행된다.
  const projectChars = useMemo(
    () => characters.filter(c => c.projectId === activeProjectId),
    [characters, activeProjectId],
  );

  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef(null);
  useEffect(() => {
    if (!helpOpen) return;
    const handler = (e) => { if (!helpRef.current?.contains(e.target)) setHelpOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler); };
  }, [helpOpen]);

  const [view, setView] = useState('graph'); // 'graph' | 'edit' | 'print'
  const [positions, setPositions] = useState({});
  const containerRef = useRef(null);
  const [containerW, setContainerW] = useState(700);

  // Collect all edges from all characters
  const allEdges = useMemo(() => {
    const edges = [];
    projectChars.forEach(c => {
      (c.relationships || []).forEach(r => {
        edges.push({ id: r.id, fromId: c.id, toId: r.targetId, label: r.label || '' });
      });
    });
    return edges;
  }, [projectChars]);

  // Measure container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 저장된 relPos 우선 → 없는 캐릭터만 자동배치.
  // 드래그 중에는 dispatch가 없어 projectChars가 그대로이므로 이 effect가 끼어들지 않는다.
  useEffect(() => {
    const W = containerRef.current?.offsetWidth || containerW;
    setPositions(prev => {
      const next = mergePositions(projectChars, W, prev);
      return samePositions(prev, next) ? prev : next;
    });
  }, [projectChars, containerW]);

  // 드래그 중 최신 좌표를 이벤트 핸들러에서 읽기 위한 ref (stale closure 방지)
  const positionsRef = useRef(positions);
  useEffect(() => { positionsRef.current = positions; }, [positions]);
  const charsRef = useRef(projectChars);
  useEffect(() => { charsRef.current = projectChars; }, [projectChars]);

  // 드래그 종료 시 1회만 영속화 — 이동 중에는 로컬 state로만 그린다.
  const commitPos = useCallback((charId, pos) => {
    const c = charsRef.current.find(x => x.id === charId);
    if (!c) return;
    const relPos = { x: Math.round(pos.x), y: Math.round(pos.y) };
    const prev = c.relPos;
    // 실제로 움직인 경우에만 dispatch (클릭만 했으면 no-op)
    if (isValidPos(prev) && prev.x === relPos.x && prev.y === relPos.y) return;
    dispatch({ type: 'UPDATE_CHARACTER', payload: { id: charId, relPos } });
  }, [dispatch]);

  // Drag handler — pointer 이벤트로 마우스/터치/펜 공통 처리
  const startDrag = useCallback((charId, e) => {
    if (e.button > 0) return; // 우클릭/보조 버튼은 드래그로 취급하지 않음
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const ox = e.clientX - rect.left;
    const oy = e.clientY - rect.top;
    const startPos = { ...(positionsRef.current[charId] || { x: 0, y: 0 }) };
    const W = container.offsetWidth;
    const pointerId = e.pointerId;
    let lastPos = startPos;

    const onMove = (me) => {
      if (me.pointerId !== pointerId) return;
      const nx = me.clientX - rect.left;
      const ny = me.clientY - rect.top;
      lastPos = clampPos({ x: startPos.x + (nx - ox), y: startPos.y + (ny - oy) }, W);
      setPositions(prev => ({ ...prev, [charId]: lastPos }));
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // pointercancel(시스템 제스처 등)도 마지막 위치를 그대로 확정한다 — 되돌리면 사용자가 잃는다.
    function onUp(ue) {
      if (ue && ue.pointerId !== pointerId) return;
      cleanup();
      commitPos(charId, lastPos);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [commitPos]);

  // 자동 배치: 저장된 좌표를 비워야 다음 진입에서도 자동배치가 유지된다.
  const resetLayout = () => {
    const W = containerRef.current?.offsetWidth || containerW;
    setPositions(autoPositions(projectChars, W));
    projectChars.forEach(c => {
      if (isValidPos(c.relPos)) {
        dispatch({ type: 'UPDATE_CHARACTER', payload: { id: c.id, relPos: null } });
      }
    });
  };

  // CRUD helpers
  const addRel = (fromId, toId, label = '') => {
    const c = projectChars.find(x => x.id === fromId);
    if (!c) return;
    dispatch({
      type: 'UPDATE_CHARACTER',
      payload: { id: fromId, relationships: [...(c.relationships || []), { id: genId(), targetId: toId, label: label || '' }] },
    });
  };

  const updateRel = (fromId, relId, field, val) => {
    const c = projectChars.find(x => x.id === fromId);
    if (!c) return;
    dispatch({
      type: 'UPDATE_CHARACTER',
      payload: {
        id: fromId,
        relationships: (c.relationships || []).map(r => r.id === relId ? { ...r, [field]: val } : r),
      },
    });
  };

  const removeRel = (fromId, relId) => {
    const c = projectChars.find(x => x.id === fromId);
    if (!c) return;
    dispatch({
      type: 'UPDATE_CHARACTER',
      payload: { id: fromId, relationships: (c.relationships || []).filter(r => r.id !== relId) },
    });
  };

  if (!activeProjectId) return null;

  const isPrint = view === 'print';

  const tabBtn = (id, label) => (
    <button
      key={id}
      onClick={() => setView(id)}
      style={{
        padding: '3px 10px', borderRadius: '6px', fontSize: '12px',
        background: view === id ? 'var(--c-accent)' : 'transparent',
        color: view === id ? '#fff' : 'var(--c-text4)',
        border: `1px solid ${view === id ? 'var(--c-accent)' : 'var(--c-border3)'}`,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--c-bg)' }}>
      {/* Header */}
      {!isPrint && (
        <div style={{ padding: '10px 10px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--c-text2)' }}>인물관계도</span>
          <div ref={helpRef} style={{ position: 'relative', display: 'inline-flex' }}>
            <button onClick={() => setHelpOpen(v => !v)} title="도움말" style={{ width: 18, height: 18, borderRadius: '50%', border: '1px solid var(--c-border3)', background: helpOpen ? 'var(--c-active)' : 'transparent', color: 'var(--c-text5)', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0 }}>?</button>
            {helpOpen && (
              <div style={{ position: 'absolute', top: '24px', left: 0, zIndex: 200, background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 8, padding: '10px 14px', width: 240, boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--c-text3)' }}>인물관계도 안내</div>
                {['편집 탭에서 인물 간 관계를 추가하세요.', '그래프 탭에서 노드를 드래그해 배치를 조정할 수 있습니다.', '인쇄 탭에서 관계도를 PDF로 저장할 수 있습니다.'].map((t, i) => (
                  <div key={i} className="text-[11px] leading-relaxed" style={{ color: 'var(--c-text5)' }}>· {t}</div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {tabBtn('graph', '관계도')}
            {tabBtn('edit', '편집')}
            <button
              onClick={() => setView('print')}
              style={{
                padding: '3px 10px', borderRadius: '6px', fontSize: '12px',
                background: 'transparent', color: 'var(--c-text4)',
                border: '1px solid var(--c-border3)', cursor: 'pointer',
              }}
            >인쇄 미리보기</button>
          </div>
        </div>
      )}

      {/* Graph view */}
      {view === 'graph' && (
        <div style={{ padding: '0 24px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--c-text6)' }}>카드를 드래그해 위치를 조정할 수 있습니다</span>
            <button
              onClick={resetLayout}
              style={{ fontSize: '11px', color: 'var(--c-text5)', background: 'none', border: 'none', cursor: 'pointer' }}
            >자동 배치</button>
          </div>
          <GraphCanvas
            chars={projectChars}
            edges={allEdges}
            positions={positions}
            containerRef={containerRef}
            onDragStart={startDrag}
            printMode={false}
          />
          {projectChars.length < 2 && (
            <div style={{ textAlign: 'center', padding: '40px 0', fontSize: '12px', color: 'var(--c-text6)' }}>
              인물을 2명 이상 등록하면 관계도를 볼 수 있습니다
            </div>
          )}
        </div>
      )}

      {/* Edit view */}
      {view === 'edit' && (
        <EditView
          projectChars={projectChars}
          allEdges={allEdges}
          onAdd={addRel}
          onUpdate={updateRel}
          onRemove={removeRel}
        />
      )}

      {/* Print view */}
      {isPrint && (
        <div>
          <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 24px', borderBottom: '1px solid var(--c-border)' }}>
            <button
              onClick={() => setView('graph')}
              style={{ fontSize: '12px', color: 'var(--c-text4)', background: 'none', border: 'none', cursor: 'pointer' }}
            >← 돌아가기</button>
            <button
              onClick={() => window.print()}
              style={{ fontSize: '12px', background: 'var(--c-accent)', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 14px', cursor: 'pointer' }}
            >인쇄</button>
          </div>
          <div style={{ padding: '24px' }}>
            <GraphCanvas
              chars={projectChars}
              edges={allEdges}
              positions={positions}
              containerRef={containerRef}
              onDragStart={() => {}}
              printMode
            />
          </div>
        </div>
      )}
    </div>
  );
}
