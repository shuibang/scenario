// picker 위치 계산 — caret/blockEl rect를 받아 viewport 안으로 보정한 fixed 좌표 반환
//
// 정책:
//  - 좌우: 기본 anchor.left, 우측 부족 시 anchor.right - width(우정렬), 양 끝 padding 안쪽 클램프
//  - 상하: 기본 anchor.bottom + gap(아래), 부족 시 anchor.top - gap - height(위), 둘 다 부족하면
//    더 넓은 쪽에 두고 viewport padding 안쪽 클램프
//  - viewport: visualViewport 우선 (모바일 키보드 대응)

export function getPickerPosition({ anchorRect, pickerSize, padding = 16, gap = 4, bottomReserved = 0 }) {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  const vvTop  = vv?.offsetTop  ?? 0;
  const vvLeft = vv?.offsetLeft ?? 0;
  const vvW    = vv?.width  ?? (typeof window !== 'undefined' ? window.innerWidth  : 1024);
  const vvH    = vv?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 768);
  // bottomReserved: 모바일 하단 고정 UI(탭바 + 광고)에 가려지는 영역. picker가 그 위로 안 침범하도록 vBottom에서 차감.
  const vBottom = vvTop + vvH - Math.max(0, bottomReserved);
  const vRight  = vvLeft + vvW;

  // 좌우
  let left = anchorRect.left;
  if (left + pickerSize.width > vRight - padding) {
    left = anchorRect.right - pickerSize.width;
  }
  const minLeft = vvLeft + padding;
  const maxLeft = vRight - padding - pickerSize.width;
  left = Math.max(minLeft, Math.min(left, Math.max(minLeft, maxLeft)));

  // 상하
  const spaceBelow = vBottom - anchorRect.bottom;
  const spaceAbove = anchorRect.top - vvTop;
  const needed = pickerSize.height + gap;
  let top;
  if (spaceBelow >= needed + padding) {
    top = anchorRect.bottom + gap;
  } else if (spaceAbove >= needed + padding) {
    top = anchorRect.top - gap - pickerSize.height;
  } else {
    top = spaceBelow >= spaceAbove
      ? anchorRect.bottom + gap
      : anchorRect.top - gap - pickerSize.height;
  }
  const minTop = vvTop + padding;
  const maxTop = vBottom - padding - pickerSize.height;
  top = Math.max(minTop, Math.min(top, Math.max(minTop, maxTop)));

  return { top, left };
}

// 모바일 하단 고정 UI(MobileBottomPanel + AdBanner)의 visible 높이 측정.
// 데스크톱에선 selector 매칭 element가 없거나 hidden → 0 반환.
// focusMode/접힘 등으로 element가 layout에 없으면 (offsetHeight === 0) 0으로 처리하는 안전망 포함.
export function measureBottomReserved() {
  if (typeof document === 'undefined') return 0;
  let total = 0;
  const sels = ['[data-mobile-bottom-ad]', '[data-mobile-bottom-panel]'];
  for (const sel of sels) {
    const el = document.querySelector(sel);
    if (!el) continue;
    // focusMode/접힘 시 0 → 측정 안 함
    if (el.offsetHeight === 0) continue;
    total += el.getBoundingClientRect().height;
  }
  return total;
}

// caret rect 폴백 결정 헬퍼 — savedRange가 invalid이거나 collapsed-zero면 block rect로 폴백
//
// 호출 예:
//   const anchorRect = resolveAnchorRect(savedRange, blockEl);
//   setPickerState({ ..., anchorRect });
export function resolveAnchorRect(savedRange, blockEl) {
  if (savedRange) {
    try {
      const r = savedRange.getBoundingClientRect();
      // 일부 브라우저/IME 직후 collapsed range는 zero-width rect 반환 (정상).
      // top/bottom 둘 다 0이고 left/right 둘 다 0이어야만 invalid로 간주 — caret이 viewport(0,0)에 정확히 있을 확률은 사실상 0.
      const isZero = r.top === 0 && r.bottom === 0 && r.left === 0 && r.right === 0;
      if (!isZero) {
        // collapsed caret이라 width=0, height=0이지만 line-height만큼이라도 anchor에 줘야 picker가 caret 줄 바로 아래에 뜸.
        // 일부 브라우저는 collapsed range가 height=0인 rect를 반환하는데, 그러면 anchor.bottom == anchor.top이라 picker가 caret 글자 위에 겹침.
        // 폴백: height=0이면 block element의 line-height/높이로 보정.
        let top = r.top, bottom = r.bottom, left = r.left, right = r.right;
        if (bottom === top && blockEl) {
          // caret rect가 zero-height인 브라우저(IME 직후 등)에선 picker가 caret 줄과 겹쳐 "줄 위로 올라간 자리"처럼 보임.
          // 해당 line의 line-height만큼 bottom을 확장해 picker가 caret 줄 바로 아래에 뜨도록 함.
          let lh = 22; // safe default
          try {
            const cs = window.getComputedStyle(blockEl);
            const fs = parseFloat(cs.fontSize) || 14;
            const parsed = parseFloat(cs.lineHeight);
            lh = Number.isFinite(parsed) && parsed > 0 ? parsed : Math.round(fs * 1.5);
          } catch (_e) { /* keep default */ }
          bottom = top + lh;
        }
        return { top, bottom, left, right };
      }
    } catch (_e) {
      // 분리된 노드에 대한 range 등 — 폴백
    }
  }
  if (blockEl && typeof blockEl.getBoundingClientRect === 'function') {
    const r = blockEl.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  }
  // 최후 폴백
  return { top: 120, bottom: 144, left: 200, right: 460 };
}
