import { useState, useRef, useEffect } from "react";

const SHOT_SIZES = ["ELS", "LS", "MS", "MCU", "CU", "ECU", "OTS", "POV", "2-SHOT"];
const CAMERA_MOVES = ["Static", "Pan →", "Pan ←", "Tilt ↑", "Tilt ↓", "Zoom In", "Zoom Out", "Track", "Dolly", "Handheld", "Crane"];
const TRANSITIONS = ["Cut", "Fade In", "Fade Out", "Dissolve", "Wipe", "Match Cut"];

// 대본 작업실 block type → 역할 분류
function classifyBlock(type) {
  const t = (type || "").toLowerCase();
  if (["scene","scene_number","scene_heading","slug","씬헤더","슬러그"].includes(t)) return "scene";
  if (["character","char","캐릭터"].includes(t)) return "character";
  if (["dialogue","dialog","대사"].includes(t)) return "dialogue";
  if (["parenthetical","괄호"].includes(t)) return "parenthetical";
  if (["transition","전환"].includes(t)) return "transition";
  return "action";
}

// ── 블록 배열 → 스토리보드 패널 배열 ─────────────────────────────────────────
function parseScriptBlocks(blocks) {
  if (!blocks || blocks.length === 0) return [];
  const panels = [];
  let current = null;
  let currentChar = "";
  let cutNo = 0;
  let sceneNo = 0;

  const push = () => { if (current) panels.push(current); };
  const newPanel = (heading) => {
    push(); cutNo++; sceneNo++;
    current = {
      id: Date.now() + cutNo,
      shotSize: "MS", cameraMove: "Static", transition: "Cut",
      dialogue: "", action: "", duration: "3",
      sceneNo: String(sceneNo), cutNo: String(cutNo),
      drawingData: null, _sceneHeading: heading || `씬 ${sceneNo}`,
    };
    currentChar = "";
  };

  for (const block of blocks) {
    const role = classifyBlock(block.type);
    const text = (block.content || block.text || "").trim();

    if (role === "scene") {
      newPanel(text);
    } else {
      if (!current) newPanel("");
      if (role === "character") {
        currentChar = text;
      } else if (role === "dialogue") {
        const line = currentChar ? `${currentChar}: ${text}` : text;
        current.dialogue = current.dialogue ? `${current.dialogue}\n${line}` : line;
        currentChar = "";
      } else if (role === "parenthetical") {
        if (text) current.action = current.action ? `${current.action}\n(${text})` : `(${text})`;
      } else if (role === "action") {
        if (text) current.action = current.action ? `${current.action}\n${text}` : text;
      } else if (role === "transition") {
        if (current && text) {
          current.transition = text.includes("페이드") ? "Fade Out"
            : text.includes("디졸브") ? "Dissolve" : "Cut";
        }
      }
    }
  }
  push();
  return panels;
}

// ── Import Modal ──────────────────────────────────────────────────────────────
function ImportModal({ onImport, onClose }) {
  const [status, setStatus] = useState("loading");
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [preview, setPreview] = useState([]);
  const [rawCount, setRawCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("drama_projects");
      if (!raw) throw new Error("drama_projects 키를 찾을 수 없어요.\n대본 작업실에서 프로젝트를 한 번 저장해보세요.");
      const proj = JSON.parse(raw);
      if (!Array.isArray(proj) || proj.length === 0) throw new Error("저장된 프로젝트가 없어요.");
      setProjects(proj);
      setStatus("projects");
    } catch (e) {
      setErrorMsg(e.message);
      setStatus("error");
    }
  }, []);

  const selectProject = (proj) => {
    setSelectedProject(proj);
    try {
      const epRaw = localStorage.getItem("drama_episodes");
      const allEp = epRaw ? JSON.parse(epRaw) : [];
      const filtered = allEp.filter(e => e.projectId === proj.id);
      if (filtered.length > 0) {
        setEpisodes(filtered);
        setStatus("episodes");
      } else {
        loadBlocks(proj.id, null);
      }
    } catch {
      loadBlocks(proj.id, null);
    }
  };

  const loadBlocks = (projectId, episodeId) => {
    setStatus("loading");
    try {
      const raw = localStorage.getItem("drama_scriptBlocks");
      if (!raw) throw new Error("drama_scriptBlocks 키가 없어요.");
      const all = JSON.parse(raw);
      const filtered = all.filter(b => {
        if (b.projectId !== projectId) return false;
        if (episodeId && b.episodeId !== episodeId) return false;
        return true;
      });
      if (filtered.length === 0)
        throw new Error("해당 프로젝트에 블록이 없어요.\n대본 내용을 먼저 입력해주세요.");
      setRawCount(filtered.length);
      const panels = parseScriptBlocks(filtered);
      if (panels.length === 0)
        throw new Error("씬 헤더 블록(S# 타입)이 없어서 패널을 나눌 수 없어요.");
      setPreview(panels);
      setStatus("preview");
    } catch (e) {
      setErrorMsg(e.message);
      setStatus("error");
    }
  };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:200, background:"rgba(0,0,0,0.72)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"var(--c-panel)", border:"1px solid var(--c-border)", borderRadius:10, width:"100%", maxWidth:520, maxHeight:"82vh", overflow:"auto", padding:24 }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
          <div style={{ width:30, height:30, borderRadius:6, background:"var(--c-accent)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>📄</div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:"var(--c-text2)" }}>대본 작업실에서 불러오기</div>
            <div style={{ fontSize:11, color:"var(--c-text5)" }}>localStorage → 스토리보드 자동 변환</div>
          </div>
          <button onClick={onClose} style={{ marginLeft:"auto", padding:"4px 10px", border:"1px solid var(--c-border)", borderRadius:6, background:"transparent", color:"var(--c-text4)", cursor:"pointer" }}>✕</button>
        </div>

        {status === "loading" && (
          <div style={{ textAlign:"center", padding:"40px 0", color:"var(--c-text5)" }}>
            <div style={{ fontSize:24, marginBottom:8 }}>⏳</div>파싱 중...
          </div>
        )}

        {status === "error" && (
          <div style={{ textAlign:"center", padding:"32px 20px" }}>
            <div style={{ fontSize:24, marginBottom:12 }}>⚠️</div>
            <div style={{ color:"var(--c-error)", whiteSpace:"pre-line", fontSize:13, lineHeight:1.8, marginBottom:20 }}>{errorMsg}</div>
            <button onClick={onClose} style={{ padding:"8px 24px", border:"1px solid var(--c-border)", borderRadius:6, background:"transparent", color:"var(--c-text3)", cursor:"pointer" }}>닫기</button>
          </div>
        )}

        {status === "projects" && (
          <div>
            <span style={{ fontSize:10, color:"var(--c-text5)", fontFamily:"monospace", letterSpacing:1, textTransform:"uppercase", marginBottom:8, display:"block" }}>프로젝트 선택</span>
            {projects.map(p => (
              <button key={p.id} onClick={() => selectProject(p)}
                style={{ padding:"10px 12px", border:"1px solid var(--c-border)", borderRadius:8, background:"var(--c-hover)", cursor:"pointer", display:"flex", alignItems:"center", gap:10, width:"100%", textAlign:"left", marginBottom:6 }}>
                <span style={{ fontSize:16 }}>🎬</span>
                <div>
                  <div style={{ color:"var(--c-text2)", fontSize:13 }}>{p.title || p.name || "제목 없음"}</div>
                  <div style={{ color:"var(--c-text5)", fontSize:10, fontFamily:"monospace" }}>{p.id}</div>
                </div>
                <span style={{ marginLeft:"auto", color:"var(--c-text4)" }}>→</span>
              </button>
            ))}
          </div>
        )}

        {status === "episodes" && (
          <div>
            <span style={{ fontSize:10, color:"var(--c-text5)", fontFamily:"monospace", letterSpacing:1, textTransform:"uppercase", marginBottom:8, display:"block" }}>에피소드 선택</span>
            <button onClick={() => loadBlocks(selectedProject.id, null)}
              style={{ padding:"10px 12px", border:"1px solid var(--c-border)", borderRadius:8, background:"var(--c-hover)", cursor:"pointer", display:"flex", alignItems:"center", gap:10, width:"100%", textAlign:"left", marginBottom:6 }}>
              <span>📚</span><span style={{ color:"var(--c-text2)" }}>전체 불러오기</span>
            </button>
            {episodes.map(ep => (
              <button key={ep.id} onClick={() => loadBlocks(selectedProject.id, ep.id)}
                style={{ padding:"10px 12px", border:"1px solid var(--c-border)", borderRadius:8, background:"var(--c-hover)", cursor:"pointer", display:"flex", alignItems:"center", gap:10, width:"100%", textAlign:"left", marginBottom:6 }}>
                <span>📝</span>
                <span style={{ color:"var(--c-text2)" }}>{ep.title || ep.name || `에피소드 ${ep.order || ""}`}</span>
              </button>
            ))}
          </div>
        )}

        {status === "preview" && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:16 }}>
              {[["총 블록", rawCount], ["생성 패널", preview.length], ["예상 시간", `${preview.length*3}초`]].map(([l,v]) => (
                <div key={l} style={{ background:"var(--c-tag)", border:"1px solid var(--c-border)", borderRadius:8, padding:"10px 0", textAlign:"center" }}>
                  <div style={{ fontSize:18, fontWeight:700, color:"var(--c-accent)" }}>{v}</div>
                  <div style={{ fontSize:10, color:"var(--c-text5)", fontFamily:"monospace" }}>{l}</div>
                </div>
              ))}
            </div>

            <span style={{ fontSize:10, color:"var(--c-text5)", fontFamily:"monospace", letterSpacing:1, textTransform:"uppercase", marginBottom:8, display:"block" }}>씬 미리보기</span>
            <div style={{ maxHeight:220, overflowY:"auto", display:"flex", flexDirection:"column", gap:4, marginBottom:14 }}>
              {preview.map((panel, i) => (
                <div key={panel.id} style={{ background:"var(--c-hover)", border:"1px solid var(--c-border)", borderRadius:6, padding:"8px 10px", display:"flex", gap:8, alignItems:"flex-start" }}>
                  <span style={{ background:"#e8a020", color:"#000", fontSize:9, fontWeight:700, padding:"2px 5px", borderRadius:3, fontFamily:"monospace", flexShrink:0, marginTop:2 }}>
                    CUT {i+1}
                  </span>
                  <div style={{ minWidth:0 }}>
                    <div style={{ color:"var(--c-text2)", fontSize:12, fontWeight:600 }}>{panel._sceneHeading}</div>
                    {panel.action && <div style={{ color:"var(--c-text4)", fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{panel.action.slice(0,60)}{panel.action.length>60?"...":""}</div>}
                    {panel.dialogue && <div style={{ color:"var(--c-text3)", fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>💬 {panel.dialogue.slice(0,50)}</div>}
                  </div>
                </div>
              ))}
            </div>

            {preview.length === 1 && (
              <div style={{ background:"var(--c-tag)", border:"1px solid var(--c-border2)", borderRadius:6, padding:"8px 12px", fontSize:11, color:"var(--c-text3)", lineHeight:1.7, marginBottom:12 }}>
                💡 씬이 1개로 합쳐진 경우, 대본에 <strong>씬 헤더 블록</strong>(S#01. 장소 - 낮)을 추가하면 씬별로 자동 분리돼요.
              </div>
            )}

            <div style={{ display:"flex", gap:8 }}>
              <button onClick={onClose} style={{ flex:1, padding:"10px", border:"1px solid var(--c-border)", borderRadius:6, background:"transparent", color:"var(--c-text4)", cursor:"pointer" }}>취소</button>
              <button onClick={() => onImport(preview)} style={{ flex:2, padding:"10px", border:"none", borderRadius:6, background:"var(--c-accent)", color:"#fff", fontWeight:700, cursor:"pointer", fontSize:13 }}>
                ✅ {preview.length}개 패널로 불러오기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Mini Drawing Canvas ──────────────────────────────────────────────────────
function DrawingCanvas({ initialData, onSave, isLight }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState("pen");
  const lastPos = useRef(null);

  const canvasBg  = isLight ? "#f5f0e8" : "#252535";
  const canvasPen = isLight ? "#1a1a1a" : "#e0ddd8";

  const fillBg = (ctx, canvas) => {
    ctx.fillStyle = canvasBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    fillBg(ctx, canvas);
    if (initialData) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = initialData;
    }
  }, []);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (cx - rect.left) * sx, y: (cy - rect.top) * sy };
  };

  const startDraw = (e) => { e.preventDefault(); setIsDrawing(true); lastPos.current = getPos(e, canvasRef.current); };
  const draw = (e) => {
    e.preventDefault(); if (!isDrawing) return;
    const canvas = canvasRef.current, ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    ctx.beginPath(); ctx.moveTo(lastPos.current.x, lastPos.current.y); ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = tool === "eraser" ? canvasBg : canvasPen;
    ctx.lineWidth = tool === "eraser" ? 12 : 1.5;
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
    lastPos.current = pos;
  };
  const endDraw = () => { if (!isDrawing) return; setIsDrawing(false); onSave(canvasRef.current.toDataURL()); };
  const clear = () => {
    const canvas = canvasRef.current, ctx = canvas.getContext("2d");
    fillBg(ctx, canvas);
    onSave(canvas.toDataURL());
  };

  return (
    <div style={{ position:"relative" }}>
      <canvas ref={canvasRef} width={320} height={180}
        style={{ width:"100%", aspectRatio:"16/9", display:"block", cursor: tool==="eraser"?"cell":"crosshair", borderRadius:2 }}
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
      />
      <div style={{ position:"absolute", bottom:6, right:6, display:"flex", gap:4 }}>
        {[["pen","✏️","펜"],["eraser","🧹","지우개"]].map(([t,icon,label]) => (
          <button key={t} onClick={()=>setTool(t)} title={label}
            style={{ width:28, height:28, border:"none", borderRadius:4, cursor:"pointer", background: tool===t?"var(--c-accent)":"var(--c-tag)", color: tool===t?"#fff":"var(--c-text3)", fontSize:13 }}>{icon}</button>
        ))}
        <button onClick={clear} title="초기화"
          style={{ width:28, height:28, border:"none", borderRadius:4, cursor:"pointer", background:"rgba(239,68,68,0.18)", color:"var(--c-error)", fontSize:13 }}>✕</button>
      </div>
      <svg style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", pointerEvents:"none", opacity:0.15 }} viewBox="0 0 320 180">
        <line x1="107" y1="0" x2="107" y2="180" stroke="currentColor" strokeWidth="0.5" strokeDasharray="3,3"/>
        <line x1="213" y1="0" x2="213" y2="180" stroke="currentColor" strokeWidth="0.5" strokeDasharray="3,3"/>
        <line x1="0" y1="60" x2="320" y2="60" stroke="currentColor" strokeWidth="0.5" strokeDasharray="3,3"/>
        <line x1="0" y1="120" x2="320" y2="120" stroke="currentColor" strokeWidth="0.5" strokeDasharray="3,3"/>
      </svg>
    </div>
  );
}

// ─── Panel Card ───────────────────────────────────────────────────────────────
const inp = {
  width:"100%", background:"var(--c-input)", border:"1px solid var(--c-border)",
  borderRadius:4, color:"var(--c-text)", padding:"6px 8px", fontSize:12,
  fontFamily:"inherit", boxSizing:"border-box", outline:"none",
};
const lbl = {
  display:"block", fontSize:10, color:"var(--c-text5)",
  fontFamily:"monospace", letterSpacing:1, textTransform:"uppercase", marginBottom:4,
};

function PanelCard({ panel, index, total, onChange, onDelete, onMove, cardView, isLight }) {
  const [expanded, setExpanded] = useState(true);
  const u = (f, v) => onChange({ ...panel, [f]: v });
  const isRow = cardView === "row";

  const fields = (
    <div style={{ display:"flex", flexDirection:"column", gap:10, flex:1, minWidth:0 }}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
        <div><label style={lbl}>샷 사이즈</label>
          <select value={panel.shotSize} onChange={e=>u("shotSize",e.target.value)} style={inp}>
            {SHOT_SIZES.map(s=><option key={s}>{s}</option>)}</select></div>
        <div><label style={lbl}>카메라 무브</label>
          <select value={panel.cameraMove} onChange={e=>u("cameraMove",e.target.value)} style={inp}>
            {CAMERA_MOVES.map(s=><option key={s}>{s}</option>)}</select></div>
        <div><label style={lbl}>전환 효과</label>
          <select value={panel.transition} onChange={e=>u("transition",e.target.value)} style={inp}>
            {TRANSITIONS.map(s=><option key={s}>{s}</option>)}</select></div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
        <div><label style={lbl}>씬 번호</label><input value={panel.sceneNo} onChange={e=>u("sceneNo",e.target.value)} placeholder="01" style={inp}/></div>
        <div><label style={lbl}>컷 번호</label><input value={panel.cutNo} onChange={e=>u("cutNo",e.target.value)} style={inp}/></div>
        <div><label style={lbl}>시간(초)</label><input value={panel.duration} onChange={e=>u("duration",e.target.value)} type="number" min="1" style={inp}/></div>
      </div>
      <div><label style={lbl}>대사 / 나레이션</label>
        <textarea value={panel.dialogue} onChange={e=>u("dialogue",e.target.value)} placeholder="대사를 입력하세요..." style={{...inp, minHeight:52, resize:"vertical", lineHeight:1.5}}/></div>
      <div><label style={lbl}>액션 / 연출 지시</label>
        <textarea value={panel.action} onChange={e=>u("action",e.target.value)} placeholder="인물의 동작, 감정, 조명..." style={{...inp, minHeight:52, resize:"vertical", lineHeight:1.5}}/></div>
    </div>
  );

  return (
    <div style={{ background:"var(--c-card)", border:"1px solid var(--c-border)", borderRadius:8, overflow:"hidden" }}>
      {/* Card header */}
      <div style={{ background:"var(--c-panel)", padding:"8px 12px", display:"flex", alignItems:"center", gap:10, borderBottom:"1px solid var(--c-border)" }}>
        <div style={{ display:"flex", flexDirection:"column", gap:3, opacity:0.3 }}>
          {[0,1,2].map(i=><div key={i} style={{ width:4, height:4, borderRadius:"50%", background:"var(--c-text4)" }}/>)}
        </div>
        <div style={{ display:"flex", gap:6, alignItems:"center", flex:1, minWidth:0 }}>
          <span style={{ background:"#e8a020", color:"#000", fontSize:10, fontWeight:700, padding:"2px 6px", borderRadius:3, fontFamily:"monospace", flexShrink:0 }}>
            CUT {panel.cutNo || index+1}
          </span>
          {panel.sceneNo && <span style={{ border:"1px solid var(--c-border2)", color:"var(--c-text4)", fontSize:10, padding:"2px 6px", borderRadius:3, fontFamily:"monospace", flexShrink:0 }}>S#{panel.sceneNo}</span>}
          {panel._sceneHeading && <span style={{ color:"var(--c-text3)", fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{panel._sceneHeading}</span>}
        </div>
        <div style={{ display:"flex", gap:4, flexShrink:0 }}>
          <button onClick={()=>onMove(index,-1)} disabled={index===0} className="text-xs px-1.5 py-0.5 rounded" style={{ border:"1px solid var(--c-border)", background:"transparent", color:"var(--c-text4)", cursor:"pointer" }}>↑</button>
          <button onClick={()=>onMove(index,1)} disabled={index===total-1} className="text-xs px-1.5 py-0.5 rounded" style={{ border:"1px solid var(--c-border)", background:"transparent", color:"var(--c-text4)", cursor:"pointer" }}>↓</button>
          <button onClick={()=>setExpanded(e=>!e)} className="text-xs px-2 py-0.5 rounded" style={{ border:"1px solid var(--c-border)", background:"transparent", color:"var(--c-text4)", cursor:"pointer" }}>{expanded?"−":"+"}</button>
          <button onClick={()=>onDelete(panel.id)} className="text-xs px-1.5 py-0.5 rounded" style={{ border:"1px solid var(--c-border)", background:"transparent", color:"var(--c-error)", cursor:"pointer" }}>✕</button>
        </div>
      </div>

      {expanded && (
        isRow ? (
          /* 가로형: 그림 40% | 내용 60% */
          <div style={{ display:"flex", gap:0 }}>
            <div style={{ width:"40%", flexShrink:0, borderRight:"1px solid var(--c-border)" }}>
              <DrawingCanvas initialData={panel.drawingData} onSave={d=>u("drawingData",d)} isLight={isLight}/>
            </div>
            <div style={{ flex:1, padding:12, minWidth:0 }}>
              {fields}
            </div>
          </div>
        ) : (
          /* 카드형: 그림 위 | 내용 아래 */
          <div style={{ padding:12, display:"flex", flexDirection:"column", gap:10 }}>
            <div style={{ border:"1px solid var(--c-border)", borderRadius:4, overflow:"hidden" }}>
              <DrawingCanvas initialData={panel.drawingData} onSave={d=>u("drawingData",d)} isLight={isLight}/>
            </div>
            {fields}
          </div>
        )
      )}
    </div>
  );
}

// ─── Print View ───────────────────────────────────────────────────────────────
function PrintView({ panels, title, onClose, cardView }) {
  const isRow = cardView === "row";
  const totalSec = panels.reduce((a,p)=>a+(parseInt(p.duration)||0),0);

  const panelContent = (panel, i) => {
    const header = (
      <div style={{ padding:"5px 10px", display:"flex", gap:8, alignItems:"center", fontSize:11, fontFamily:"monospace", borderBottom:"1px solid #e0e0e0", color:"#555" }}>
        <span style={{ fontWeight:700, color:"#333" }}>CUT {panel.cutNo||i+1}</span>
        {panel.sceneNo && <span style={{ color:"#aaa" }}>S#{panel.sceneNo}</span>}
        {panel._sceneHeading && <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{panel._sceneHeading}</span>}
        <span style={{ color:"#bbb", flexShrink:0 }}>{panel.shotSize} · {panel.duration}s</span>
      </div>
    );
    const canvas = (
      <div style={{ background:"#f5f0e8", aspectRatio:"16/9", display:"flex", alignItems:"center", justifyContent:"center", width: isRow ? "40%" : "100%", flexShrink:0 }}>
        {panel.drawingData
          ? <img src={panel.drawingData} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
          : <div style={{ color:"#aaa", fontSize:11 }}>스케치 없음</div>}
      </div>
    );
    const fields = (
      <div style={{ padding:"8px 10px", fontSize:11, color:"#333", flex:1 }}>
        {panel.dialogue && <div style={{ marginBottom:4 }}><strong style={{ fontSize:10, color:"#555" }}>대사</strong><p style={{ margin:"2px 0 0", lineHeight:1.5, whiteSpace:"pre-line" }}>{panel.dialogue}</p></div>}
        {panel.action && <div style={{ marginBottom:4 }}><strong style={{ fontSize:10, color:"#555" }}>액션</strong><p style={{ margin:"2px 0 0", lineHeight:1.5, color:"#666", fontStyle:"italic", whiteSpace:"pre-line" }}>{panel.action}</p></div>}
        <div style={{ marginTop:4, paddingTop:4, borderTop:"1px solid #eee", color:"#999", fontSize:10, fontFamily:"monospace" }}>TRANSITION: {panel.transition}</div>
      </div>
    );

    return (
      <div key={panel.id} style={{ border:"1px solid #ddd", borderRadius:6, overflow:"hidden" }}>
        {header}
        {isRow ? (
          <div style={{ display:"flex" }}>
            {canvas}
            <div style={{ width:"60%", borderLeft:"1px solid #eee" }}>{fields}</div>
          </div>
        ) : (
          <>
            {canvas}
            {fields}
          </>
        )}
      </div>
    );
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#fff", zIndex:1000, overflow:"auto", padding:32 }}>
      <div style={{ maxWidth: isRow ? 1000 : 900, margin:"0 auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:24, alignItems:"center" }}>
          <div>
            <h1 style={{ margin:0, fontSize:22, color:"#111", fontFamily:"serif" }}>{title||"스토리보드"}</h1>
            <p style={{ margin:"4px 0 0", fontSize:12, color:"#666" }}>총 {panels.length}컷 · {Math.floor(totalSec/60)}분 {totalSec%60}초</p>
          </div>
          <button onClick={onClose} style={{ padding:"8px 16px", border:"1px solid #ddd", borderRadius:6, cursor:"pointer" }}>← 편집으로</button>
        </div>
        <div style={{ display:"grid", gridTemplateColumns: isRow ? "1fr" : "1fr 1fr", gap:12 }}>
          {panels.map((panel,i) => panelContent(panel, i))}
        </div>
        <div style={{ marginTop:24, textAlign:"center" }}>
          <button onClick={()=>window.print()} style={{ padding:"10px 28px", background:"#111", color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontSize:14 }}>🖨️ 인쇄하기</button>
        </div>
      </div>
      <style>{`@media print { button { display:none!important; } }`}</style>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const defPanel = (id) => ({ id, shotSize:"MS", cameraMove:"Static", transition:"Cut", dialogue:"", action:"", duration:"3", sceneNo:"", cutNo:String(id), drawingData:null, _sceneHeading:"" });

export default function StoryboardPage() {
  const [panels, setPanels] = useState([defPanel(1), defPanel(2), defPanel(3)]);
  const [nextId, setNextId] = useState(4);
  const [title, setTitle] = useState("");
  const [showPrint, setShowPrint] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [layout, setLayout] = useState("single");
  const [cardView, setCardView] = useState("card"); // "card" | "row"
  const [toast, setToast] = useState("");

  // 테마 감지: #root의 data-theme 변경을 MutationObserver로 추적
  const [isLight, setIsLight] = useState(
    () => document.getElementById("root")?.dataset.theme === "light"
  );
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;
    const observer = new MutationObserver(() => {
      setIsLight(root.dataset.theme === "light");
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(""), 3000); };
  const addPanel = () => { setPanels(p=>[...p,defPanel(nextId)]); setNextId(n=>n+1); };
  const updatePanel = (u) => setPanels(p=>p.map(panel=>panel.id===u.id?u:panel));
  const deletePanel = (id) => { if(panels.length<=1) return; setPanels(p=>p.filter(panel=>panel.id!==id)); };
  const movePanel = (index, dir) => {
    const np=[...panels], t=index+dir;
    if(t<0||t>=np.length) return;
    [np[index],np[t]]=[np[t],np[index]]; setPanels(np);
  };
  const handleImport = (imported) => {
    setPanels(imported);
    setNextId(imported.length+1);
    setShowImport(false);
    showToast(`✅ ${imported.length}개 씬을 불러왔어요!`);
  };

  const totalSec = panels.reduce((a,p)=>a+(parseInt(p.duration)||0),0);

  return (
    <div className="flex-1 min-h-0 flex flex-col" style={{ background:"var(--c-bg)" }}>

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", top:70, left:"50%", transform:"translateX(-50%)", zIndex:300, background:"var(--c-panel)", border:"1px solid var(--c-border4)", borderRadius:8, padding:"10px 20px", color:"var(--c-accent2)", fontSize:13, boxShadow:"0 4px 20px rgba(0,0,0,0.3)" }}>
          {toast}
        </div>
      )}

      {/* Header bar — TreatmentPage·SceneListPage와 동일 패턴 */}
      <div className="flex items-center gap-3 shrink-0 flex-wrap" style={{ padding:"10px", borderBottom:"1px solid var(--c-border2)" }}>
        <span className="text-sm font-medium" style={{ color:"var(--c-text2)" }}>스토리보드</span>

        <input
          value={title}
          onChange={e=>setTitle(e.target.value)}
          placeholder="제목..."
          className="text-xs rounded outline-none px-2 py-1"
          style={{ background:"var(--c-input)", color:"var(--c-text)", border:"1px solid var(--c-border3)", maxWidth:200 }}
        />

        <span className="text-xs tabular-nums" style={{ color:"var(--c-text5)", fontFamily:"monospace" }}>
          {panels.length}컷 · {Math.floor(totalSec/60)}분 {totalSec%60}초
        </span>

        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
          {/* 카드 보기 방식 토글 */}
          <div className="flex" style={{ gap:2 }}>
            {[["card","☰","카드형"],["row","⊟","가로형"]].map(([v,icon,label])=>(
              <button key={v} onClick={()=>setCardView(v)} title={label}
                className="text-xs rounded"
                style={{ padding:"3px 8px", border:"none", cursor:"pointer", background: cardView===v?"var(--c-accent)":"transparent", color: cardView===v?"#fff":"var(--c-text4)" }}>
                {icon} {label}
              </button>
            ))}
          </div>

          {/* 페이지 레이아웃 토글 */}
          <div className="flex" style={{ gap:2 }}>
            {[["single","📋","목록"],["grid","🔲","그리드"]].map(([l,icon,label])=>(
              <button key={l} onClick={()=>setLayout(l)} title={label}
                className="text-xs rounded"
                style={{ padding:"3px 8px", border:"none", cursor:"pointer", background: layout===l?"var(--c-accent)":"transparent", color: layout===l?"#fff":"var(--c-text4)" }}>
                {icon}
              </button>
            ))}
          </div>

          <button
            onClick={()=>setShowImport(true)}
            className="text-xs rounded"
            style={{ padding:"3px 10px", border:"1px solid var(--c-border3)", background:"transparent", color:"var(--c-text3)", cursor:"pointer" }}
          >📄 대본 불러오기</button>

          <button
            onClick={()=>setShowPrint(true)}
            className="text-xs rounded"
            style={{ padding:"3px 10px", border:"1px solid var(--c-border3)", background:"transparent", color:"var(--c-text3)", cursor:"pointer" }}
          >🖨️ 출력</button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ padding:"16px" }}>
        <div style={{
          maxWidth: layout==="grid" ? 1200 : 680,
          margin:"0 auto",
          display:"grid",
          gridTemplateColumns: layout==="grid" ? "repeat(auto-fill,minmax(360px,1fr))" : "1fr",
          gap:10,
        }}>
          {panels.map((panel,i)=>(
            <PanelCard key={panel.id} panel={panel} index={i} total={panels.length} onChange={updatePanel} onDelete={deletePanel} onMove={movePanel} cardView={cardView} isLight={isLight}/>
          ))}
        </div>

        <div style={{ maxWidth: layout==="grid" ? 1200 : 680, margin:"10px auto 0" }}>
          <button
            onClick={addPanel}
            className="w-full text-sm rounded-lg"
            style={{ padding:"12px", background:"transparent", border:"1px dashed var(--c-border2)", color:"var(--c-text4)", cursor:"pointer" }}
          >＋ 컷 추가하기</button>

          <div className="text-xs leading-relaxed mt-3 rounded-lg" style={{ padding:"12px 14px", background:"var(--c-tag)", border:"1px solid var(--c-border)", color:"var(--c-text5)" }}>
            <strong style={{ color:"var(--c-text3)" }}>📄 대본 불러오기 사용법</strong><br/>
            상단 버튼 클릭 → 프로젝트 선택 → 씬별 자동 변환<br/>
            대본의 <strong>씬 헤더 블록</strong>(S#01. 장소 - 시간대)을 기준으로 패널이 나뉘고, 대사·지문이 자동으로 채워져요.
          </div>
        </div>
      </div>

      {showImport && <ImportModal onImport={handleImport} onClose={()=>setShowImport(false)}/>}
      {showPrint && <PrintView panels={panels} title={title} onClose={()=>setShowPrint(false)} cardView={cardView}/>}
    </div>
  );
}
