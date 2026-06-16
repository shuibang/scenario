import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';

const TOOLS = {
  pen:         { color: '#000000', lineWidth: 2,  globalAlpha: 1.0, compositeOp: 'source-over' },
  highlighter: { color: '#FFEB00', lineWidth: 12, globalAlpha: 0.4, compositeOp: 'source-over' },
  eraser:      { color: '#000000', lineWidth: 20, globalAlpha: 1.0, compositeOp: 'destination-out' },
};

function getCanvasPos(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

const HandwritingCanvas = forwardRef(function HandwritingCanvas(
  { scriptLinkId, isActive, containerRef, activeTool = 'pen', onSave, initialImageUrl = null, initialSize = null, opacity: externalOpacity },
  ref
) {
  const canvasRef          = useRef(null);
  const drawing            = useRef(false);
  const saveTimer          = useRef(null);
  const pointsRef          = useRef([]);   // 베지어 스무딩용 포인트 누적 (펜·형광펜 공용)
  const offscreenCanvasRef = useRef(null); // 형광펜 획 누적용 오프스크린
  const savedImageRef      = useRef(null); // 획 시작 전 메인 캔버스 스냅샷 (ImageData)
  const imageUrlRef        = useRef(null); // 재생 모드에서 컨테이너 리사이즈 후 재드로우용
  const storageKey = scriptLinkId ? `director_handwriting_${scriptLinkId}` : null;

  // 캔버스를 스크롤 컨테이너 전체 크기에 맞춤, 리사이즈 전 내용 보존
  // initialSize가 있으면 그 크기로 고정하고 containerRef는 무시
  const applySize = useCallback(() => {
    if (initialSize) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const container = containerRef?.current;
      const cw = (container?.offsetWidth > 0 ? container.offsetWidth : initialSize.width);
      const scale = cw / initialSize.width;
      const tw = Math.round(cw);
      const th = Math.round(initialSize.height * scale);
      if (canvas.width === tw && canvas.height === th) return;
      canvas.width  = tw;
      canvas.height = th;
      if (imageUrlRef.current) {
        const img = new Image();
        img.onload = () => {
          const ctx = canvasRef.current?.getContext('2d');
          if (ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = imageUrlRef.current;
      }
      return;
    }
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
  }, [containerRef, initialSize]);

  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;
    applySize();
    const observer = new ResizeObserver(applySize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, applySize]);

  // scriptLinkId가 바뀌면 캔버스 초기화 후 필기 불러오기 (localStorage 우선, 없으면 initialImageUrl)
  // initialSize가 있으면 크기를 먼저 고정 후 이미지 로드
  useEffect(() => {
    if (!canvasRef.current) return;
    if (initialSize) {
      const container = containerRef?.current;
      const cw = (container?.offsetWidth > 0 ? container.offsetWidth : initialSize.width);
      const scale = cw / initialSize.width;
      canvasRef.current.width  = Math.round(cw);
      canvasRef.current.height = Math.round(initialSize.height * scale);
    }
    const ctx = canvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    let src = null;
    if (storageKey) {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        try { src = JSON.parse(raw).dataUrl; } catch { src = raw; }
      }
    }
    src = src || initialImageUrl || null;
    imageUrlRef.current = src;
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      const ctx2 = canvasRef.current?.getContext('2d');
      if (ctx2) ctx2.drawImage(img, 0, 0, canvasRef.current.width, canvasRef.current.height);
    };
    img.src = src;
  }, [scriptLinkId, storageKey, initialImageUrl, initialSize, containerRef]);

  const saveToStorage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !storageKey) return;
    try {
      const payload = JSON.stringify({
        dataUrl: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height,
      });
      localStorage.setItem(storageKey, payload);
    } catch { /* storage full */ }
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
      pointsRef.current  = [{ x, y }];
    } else if (activeTool === 'eraser') {
      // 지우개: 기존 방식 유지 (스무딩 불필요)
      const tool = TOOLS.eraser;
      ctx.globalCompositeOperation = tool.compositeOp;
      ctx.strokeStyle = tool.color;
      ctx.lineWidth   = tool.lineWidth;
      ctx.globalAlpha = tool.globalAlpha;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else {
      // 펜: pressure 감지 + 획 시작 점 찍기
      const pressure = e.pressure || 0.5;
      const lw = 2 * (0.5 + pressure * 1.5);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha  = 1.0;
      ctx.strokeStyle  = TOOLS.pen.color;
      ctx.fillStyle    = TOOLS.pen.color;
      ctx.lineWidth    = lw;
      ctx.lineCap      = 'round';
      ctx.lineJoin     = 'round';
      // 획 시작 끝점 처리 — 뭉툭한 마무리
      ctx.beginPath();
      ctx.arc(x, y, lw / 2, 0, Math.PI * 2);
      ctx.fill();
      pointsRef.current = [{ x, y }];
    }
  }, [isActive, activeTool]);

  const handlePointerMove = useCallback((e) => {
    if (!isActive || !drawing.current) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    const { x, y } = getCanvasPos(e, canvas);

    if (activeTool === 'highlighter') {
      const offscreen = offscreenCanvasRef.current;
      if (!offscreen) return;
      const offCtx = offscreen.getContext('2d');

      pointsRef.current.push({ x, y });
      const pts = pointsRef.current;
      if (pts.length < 2) return;

      // 마지막 세 점으로 베지어 제어점 계산 (오프스크린에 동일 적용)
      // pts === 2이면 직선 fallback으로 첫 획 끊김 방지
      if (pts.length === 2) {
        offCtx.beginPath();
        offCtx.moveTo(pts[0].x, pts[0].y);
        offCtx.lineTo(pts[1].x, pts[1].y);
        offCtx.stroke();
      } else {
        const p0  = pts[pts.length - 3];
        const p1  = pts[pts.length - 2];
        const p2  = pts[pts.length - 1];
        const cpX = (p0.x + p2.x) / 2;
        const cpY = (p0.y + p2.y) / 2;
        offCtx.beginPath();
        offCtx.moveTo(p0.x, p0.y);
        offCtx.quadraticCurveTo(p1.x, p1.y, cpX, cpY);
        offCtx.stroke();
      }

      // 메인 캔버스 = 스냅샷 + 오프스크린 × 0.4 (매 프레임 한 번만 합성)
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (savedImageRef.current) ctx.putImageData(savedImageRef.current, 0, 0);
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(offscreen, 0, 0);
      ctx.restore();
    } else if (activeTool === 'eraser') {
      // 지우개: destination-out 누적 방식 유지
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      // 펜: 베지어 스무딩 + pressure 감지
      pointsRef.current.push({ x, y });
      const pts = pointsRef.current;
      if (pts.length < 2) return;

      const pressure = e.pressure || 0.5;
      ctx.lineWidth = 2 * (0.5 + pressure * 1.5);

      // pts === 2이면 직선 fallback으로 첫 획 끊김 방지
      if (pts.length === 2) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.stroke();
      } else {
        const p0  = pts[pts.length - 3];
        const p1  = pts[pts.length - 2];
        const p2  = pts[pts.length - 1];
        const cpX = (p0.x + p2.x) / 2;
        const cpY = (p0.y + p2.y) / 2;

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.quadraticCurveTo(p1.x, p1.y, cpX, cpY);
        ctx.stroke();
      }
    }
  }, [isActive, activeTool]);

  const handlePointerUp = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (ctx && activeTool === 'pen') {
      // 획 끝 처리 — 뭉툭한 마무리 (ctx.lineWidth는 마지막 Move에서 설정된 값 그대로)
      const lastPt = pointsRef.current[pointsRef.current.length - 1];
      if (lastPt) {
        ctx.fillStyle = TOOLS.pen.color;
        ctx.beginPath();
        ctx.arc(lastPt.x, lastPt.y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (ctx) {
      ctx.closePath();
      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = 'source-over';
    }

    pointsRef.current  = [];
    savedImageRef.current = null;
    debouncedSave();
  }, [activeTool, debouncedSave]);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    if (storageKey) {
      try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    }
  }, [storageKey]);

  useImperativeHandle(ref, () => ({
    save() {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const dataUrl = canvas.toDataURL('image/png');
      if (onSave) onSave(dataUrl);
      return { dataUrl, width: canvas.width, height: canvas.height };
    },
  }), [onSave]);

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
          opacity: isActive ? 1 : (externalOpacity != null ? externalOpacity : 0.35),
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
});

export default HandwritingCanvas;
