import { useCallback, useEffect, useRef } from 'react';

const TOOLS = {
  pen:         { color: '#000000', lineWidth: 2,  globalAlpha: 1.0, compositeOp: 'source-over' },
  highlighter: { color: '#FFEB00', lineWidth: 12, globalAlpha: 0.4, compositeOp: 'source-over' },
  eraser:      { color: '#000000', lineWidth: 20, globalAlpha: 1.0, compositeOp: 'destination-out' },
};

function getCanvasPos(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

export default function HandwritingCanvas({ scriptLinkId, isActive, containerRef, activeTool = 'pen' }) {
  const canvasRef          = useRef(null);
  const drawing            = useRef(false);
  const saveTimer          = useRef(null);
  const lastPoint          = useRef(null);
  const offscreenCanvasRef = useRef(null); // 형광펜 획 누적용 오프스크린
  const savedImageRef      = useRef(null); // 획 시작 전 메인 캔버스 스냅샷 (ImageData)
  const storageKey = scriptLinkId ? `director_handwriting_${scriptLinkId}` : null;

  // 캔버스를 스크롤 컨테이너 전체 크기에 맞춤, 리사이즈 전 내용 보존
  const applySize = useCallback(() => {
    const container = containerRef?.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas) return;
    const w = Math.max(container.scrollWidth,  container.clientWidth,  1);
    const h = Math.max(container.scrollHeight, container.clientHeight, 1);
    if (canvas.width === w && canvas.height === h) return;
    let savedUrl = null;
    if (canvas.width > 0 && canvas.height > 0) {
      try { savedUrl = canvas.toDataURL('image/png'); } catch { /* ignore */ }
    }
    canvas.width  = w;
    canvas.height = h;
    // 오프스크린 캔버스 동기화
    let offscreen = offscreenCanvasRef.current;
    if (!offscreen) {
      offscreen = document.createElement('canvas');
      offscreenCanvasRef.current = offscreen;
    }
    offscreen.width  = w;
    offscreen.height = h;
    savedImageRef.current = null; // 크기 변경으로 스냅샷 무효화
    if (savedUrl) {
      const img = new Image();
      img.onload = () => canvas.getContext('2d').drawImage(img, 0, 0);
      img.src = savedUrl;
    }
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;
    applySize();
    const observer = new ResizeObserver(applySize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, applySize]);

  // scriptLinkId가 바뀌면 캔버스 초기화 후 해당 버전 필기 불러오기
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!storageKey) return;
    const stored = localStorage.getItem(storageKey);
    if (!stored) return;
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0);
    img.src = stored;
  }, [scriptLinkId, storageKey]);

  const saveToStorage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !storageKey) return;
    try { localStorage.setItem(storageKey, canvas.toDataURL('image/png')); } catch { /* storage full */ }
  }, [storageKey]);

  const debouncedSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveToStorage, 1000);
  }, [saveToStorage]);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const handlePointerDown = useCallback((e) => {
    if (!isActive) return;
    drawing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    const { x, y } = getCanvasPos(e, canvas);

    if (activeTool === 'highlighter') {
      const offscreen = offscreenCanvasRef.current;
      if (!offscreen) { drawing.current = false; return; }
      // 획 시작 전 메인 캔버스 스냅샷 저장
      savedImageRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // 오프스크린 초기화 (width 재할당으로 clearRect 효과)
      offscreen.width  = canvas.width;
      offscreen.height = canvas.height;
      const offCtx = offscreen.getContext('2d');
      offCtx.strokeStyle = '#FFEB00';
      offCtx.lineWidth   = 12;
      offCtx.lineCap     = 'round';
      offCtx.lineJoin    = 'round';
      offCtx.globalAlpha = 1.0; // 오프스크린엔 불투명하게
      offCtx.beginPath();
      offCtx.moveTo(x, y);
    } else {
      const tool = TOOLS[activeTool] || TOOLS.pen;
      ctx.globalCompositeOperation = tool.compositeOp;
      ctx.strokeStyle  = tool.color;
      ctx.lineWidth    = tool.lineWidth;
      ctx.globalAlpha  = tool.globalAlpha;
      ctx.lineCap      = 'round';
      ctx.lineJoin     = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
    lastPoint.current = { x, y };
  }, [isActive, activeTool]);

  const handlePointerMove = useCallback((e) => {
    if (!isActive || !drawing.current) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    const { x, y } = getCanvasPos(e, canvas);

    if (activeTool === 'highlighter') {
      const offscreen = offscreenCanvasRef.current;
      if (!offscreen || !lastPoint.current) return;
      // 오프스크린에 구간 드로우 (불투명, globalAlpha 누적 없음)
      const offCtx = offscreen.getContext('2d');
      offCtx.beginPath();
      offCtx.moveTo(lastPoint.current.x, lastPoint.current.y);
      offCtx.lineTo(x, y);
      offCtx.stroke();
      // 메인 캔버스 = 스냅샷 + 오프스크린 × 0.4 (매 프레임 한 번만 합성)
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (savedImageRef.current) ctx.putImageData(savedImageRef.current, 0, 0);
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(offscreen, 0, 0);
      ctx.restore();
      lastPoint.current = { x, y };
    } else if (activeTool === 'eraser') {
      // 지우개: destination-out 누적 방식 유지
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      // 펜: 구간별 드로우
      if (!lastPoint.current) return;
      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      lastPoint.current = { x, y };
    }
  }, [isActive, activeTool]);

  const handlePointerUp = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPoint.current  = null;
    savedImageRef.current = null;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.closePath();
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
    debouncedSave();
  }, [debouncedSave]);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    if (storageKey) {
      try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    }
  }, [storageKey]);

  const cursorStyle = !isActive ? 'default' : activeTool === 'eraser' ? 'cell' : 'crosshair';

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 10,
          pointerEvents: isActive ? 'auto' : 'none',
          opacity: isActive ? 1 : 0.35,
          touchAction: 'none',
          cursor: cursorStyle,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      {isActive && (
        <div
          style={{
            position: 'sticky',
            bottom: 16,
            zIndex: 15,
            display: 'flex',
            justifyContent: 'flex-end',
            paddingRight: 16,
            pointerEvents: 'none',
          }}
        >
          <button
            onClick={handleClear}
            style={{
              pointerEvents: 'auto',
              padding: '5px 12px',
              borderRadius: 6,
              border: '1px solid #fca5a5',
              background: 'rgba(255,245,245,0.95)',
              color: '#b91c1c',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            }}
          >
            초기화
          </button>
        </div>
      )}
    </>
  );
}
