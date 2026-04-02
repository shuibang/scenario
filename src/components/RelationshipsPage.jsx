import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useApp } from '../store/AppContext';
import { charDisplayName } from './CharacterPanel';
import { genId } from '../store/db';

const NODE_W = 110;
const NODE_H = 58;
const CANVAS_H = 480;
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
function CharNode({ char, pos, onDragStart, printMode }) {
  const initial = charDisplayName(char).charAt(0) || '?';
  return (
    <div
      onMouseDown={!printMode ? (e) => onDragStart(char.id, e) : undefined}
      style={{
        position: 'absolute',
        left: pos.x - NODE_W / 2,
        top: pos.y - NODE_H / 2,
        width: NODE_W,
        height: NODE_H,
        background: 'var(--c-card)',
        border: '1.5px solid var(--c-border2)',
        borderRadius: '8px',
        cursor: printMode ? 'default' : 'grab',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4px 8px',
        userSelect: 'none',
        boxShadow: '0 2px 6px rgba(0,0,0,0.10)',
        gap: '2px',
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
      {char.role && (
        <div style={{
          fontSize: '9px', color: 'var(--c-text5)', lineHeight: 1.2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          width: '100%', textAlign: 'center',
        }}>
          {char.role}
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

// ─── initPositions ─────────────────────────────────────────────────────────────
function initPositions(chars, W) {
  const n = chars.length;
  if (n === 0) return {};
  const cx = W / 2;
  const cy = CANVAS_H / 2;
  const r = Math.min(cx - NODE_W / 2 - 8, cy - NODE_H / 2 - 8, 180);
  return Object.fromEntries(chars.map((c, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return [c.id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }];
  }));
}

// ─── RelationshipsPage ─────────────────────────────────────────────────────────
export default function RelationshipsPage() {
  const { state, dispatch } = useApp();
  const { characters, activeProjectId } = state;

  const projectChars = characters.filter(c => c.projectId === activeProjectId);

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

  // Init positions for new characters
  useEffect(() => {
    const W = containerRef.current?.offsetWidth || containerW;
    setPositions(prev => {
      const next = { ...prev };
      let changed = false;
      const all = initPositions(projectChars, W);
      projectChars.forEach(c => {
        if (!next[c.id]) {
          next[c.id] = all[c.id] || { x: W / 2, y: CANVAS_H / 2 };
          changed = true;
        }
      });
      // Remove positions for deleted chars
      Object.keys(next).forEach(id => {
        if (!projectChars.find(c => c.id === id)) {
          delete next[id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [projectChars, containerW]);

  // Drag handler
  const startDrag = useCallback((charId, e) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const ox = e.clientX - rect.left;
    const oy = e.clientY - rect.top;
    const startPos = { ...(positions[charId] || { x: 0, y: 0 }) };
    const W = container.offsetWidth;

    const onMove = (me) => {
      const nx = me.clientX - rect.left;
      const ny = me.clientY - rect.top;
      setPositions(prev => ({
        ...prev,
        [charId]: {
          x: Math.max(NODE_W / 2, Math.min(W - NODE_W / 2, startPos.x + (nx - ox))),
          y: Math.max(NODE_H / 2, Math.min(CANVAS_H - NODE_H / 2, startPos.y + (ny - oy))),
        },
      }));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [positions]);

  const resetLayout = () => {
    const W = containerRef.current?.offsetWidth || containerW;
    setPositions(initPositions(projectChars, W));
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
        <div style={{ padding: '20px 24px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--c-text2)' }}>인물관계도</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {tabBtn('graph', '그래프')}
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
