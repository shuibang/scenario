/**
 * 정적 marketing/info 페이지 공통 광고 주입기.
 *
 * 카카오 애드핏 정책 준수:
 *  - 한 페이지 광고 최대 4개
 *  - 모바일 광고 단위(320×100)는 모바일 뷰포트에서만 노출
 *  - PC 광고 단위(160×600 스카이스크래퍼)는 데스크탑에서만 노출
 *
 * 구성 (페이지 로드 시점 뷰포트로 결정):
 *  - 모바일 (≤767px): footer 위에 카카오 320×100 세로 스택 3개
 *  - 768~1279px: footer 위에 쿠팡 가로 배너 1개
 *  - ≥1280px: 좌/우 sticky 카카오 160×600(PC 단위) + footer 위에 쿠팡 가로 배너 1~2개
 */
(function () {
  if (window.__STAR_SKY_STATIC_ADS_LOADED__) return;
  window.__STAR_SKY_STATIC_ADS_LOADED__ = true;

  var KAKAO_SCRIPT_SRC = 'https://t1.kakaocdn.net/kas/static/ba.min.js';
  var SIDEBAR_MIN_VIEWPORT = 1280;
  var IS_MOBILE = window.innerWidth <= 767;

  // 모바일 전용 — 카카오 320×100 (모바일 광고 단위) ×3 세로 스택
  var MOBILE_KAKAO_UNITS = ['DAN-EhfVcuvQrMF6L8Fk', 'DAN-NFFbgh61gOXktpCt', 'DAN-Wd3EArOUReEfw07C'];

  // 데스크탑 좌/우 sticky — 카카오 160×600 (PC 광고 단위)
  var SIDE_UNITS = {
    left:  { unitId: 'DAN-vosrnMrXTMbPT4Ra', width: 160, height: 600 },
    right: { unitId: 'DAN-hEPeSbjeJS64O2IW', width: 160, height: 600 },
  };

  // 데스크탑 하단 — 쿠팡 가로 배너 (#2는 1280px+에서만)
  var DESKTOP_COUPANG_SLOTS = ['html-bottom-1', 'html-bottom-2'];

  function ensureKakaoScript() {
    if (document.querySelector('script[data-kakao-ads-loaded="1"]')) return;
    var s = document.createElement('script');
    s.async = true;
    s.src = KAKAO_SCRIPT_SRC;
    s.dataset.kakaoAdsLoaded = '1';
    document.head.appendChild(s);
  }

  function makeKakaoIns(unitId, width, height) {
    var ins = document.createElement('ins');
    ins.className = 'kakao_ad_area';
    ins.style.display = 'none';
    ins.setAttribute('data-ad-unit', unitId);
    ins.setAttribute('data-ad-width', String(width));
    ins.setAttribute('data-ad-height', String(height));
    return ins;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fillCoupang(host, slot) {
    fetch('/api/coupang/products?slot=' + encodeURIComponent(slot) + '&limit=1')
      .then(function (r) { return r.json(); })
      .then(function (json) {
        var items = (json && Array.isArray(json.items)) ? json.items : [];
        var p = items[0];
        if (!p) { host.style.display = 'none'; return; }
        var price = p.productPrice ? Number(p.productPrice).toLocaleString() + '원' : '';
        host.innerHTML =
          '<a href="' + escapeHtml(p.productUrl || '#') + '" target="_blank" rel="noopener noreferrer sponsored nofollow"' +
          ' title="' + escapeHtml(p.productName || '') + '"' +
          ' style="display:flex;height:100%;width:100%;text-decoration:none;color:inherit;background:#fff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;align-items:center;gap:10px;padding:8px;box-sizing:border-box;">' +
            (p.productImage ? '<img src="' + escapeHtml(p.productImage) + '" alt="" loading="lazy" style="height:100%;width:auto;max-height:100%;object-fit:contain;flex-shrink:0;">' : '') +
            '<div style="flex:1;min-width:0;font-size:12px;line-height:1.4;">' +
              '<div style="overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;color:#374151;">' + escapeHtml(p.productName || '') + '</div>' +
              '<div style="color:#dc2626;font-weight:700;margin-top:2px;">' + price + '</div>' +
            '</div>' +
            '<span style="font-size:9px;padding:1px 4px;border-radius:3px;background:rgba(0,0,0,0.55);color:#fff;font-weight:600;flex-shrink:0;align-self:flex-start;">AD</span>' +
          '</a>';
      })
      .catch(function () { host.style.display = 'none'; });
  }

  function insertBeforeFooter(node) {
    var footer = document.querySelector('footer, .site-footer, .footer');
    if (footer && footer.parentNode) footer.parentNode.insertBefore(node, footer);
    else document.body.appendChild(node);
  }

  // ── 모바일: footer 위에 카카오 320×100 세로 스택 ──
  function injectMobileBottom() {
    var wrap = document.createElement('div');
    wrap.dataset.starSkyAd = 'bottom-mobile';
    wrap.setAttribute('aria-label', '광고');
    wrap.style.cssText =
      'display:flex;flex-direction:column;align-items:center;gap:12px;' +
      'width:100%;margin:24px auto 16px;padding:0 16px;box-sizing:border-box;overflow:hidden;';
    MOBILE_KAKAO_UNITS.forEach(function (unitId) {
      var card = document.createElement('div');
      card.style.cssText = 'flex:0 0 100px;max-width:100%;height:100px;display:flex;justify-content:center;align-items:center;overflow:hidden;';
      card.appendChild(makeKakaoIns(unitId, 320, 100));
      wrap.appendChild(card);
    });
    insertBeforeFooter(wrap);
  }

  // ── 데스크탑: footer 위에 쿠팡 가로 배너 (#2는 1280px+) ──
  function injectDesktopBottom() {
    var wrap = document.createElement('div');
    wrap.dataset.starSkyAd = 'bottom-desktop';
    wrap.setAttribute('aria-label', '광고');
    wrap.style.cssText =
      'display:flex;flex-wrap:nowrap;gap:8px;justify-content:center;align-items:center;' +
      'width:100%;max-width:1080px;margin:32px auto 16px;padding:0 16px;box-sizing:border-box;overflow:hidden;';
    DESKTOP_COUPANG_SLOTS.forEach(function (slot, i) {
      var card = document.createElement('div');
      card.dataset.starSkyAdSlot = String(i + 1);
      card.style.cssText = 'flex:0 1 480px;max-width:100%;height:120px;display:flex;justify-content:center;align-items:center;overflow:hidden;';
      fillCoupang(card, slot);
      wrap.appendChild(card);
    });
    if (!document.getElementById('star-sky-ad-styles')) {
      var st = document.createElement('style');
      st.id = 'star-sky-ad-styles';
      st.textContent = '@media (max-width:1279px){[data-star-sky-ad="bottom-desktop"] [data-star-sky-ad-slot="2"]{display:none;}}';
      document.head.appendChild(st);
    }
    insertBeforeFooter(wrap);
  }

  // ── 데스크탑 좌/우 sticky: 카카오 160×600 (PC 단위, ≥1280px) ──
  function injectSidebar(side) {
    var u = SIDE_UNITS[side];
    var aside = document.createElement('aside');
    aside.dataset.starSkyAd = 'side-' + side;
    aside.setAttribute('aria-label', '광고');
    var cssText = 'position:fixed;top:120px;width:' + u.width + 'px;height:' + u.height + 'px;z-index:5;pointer-events:auto;';
    cssText += side + ':16px;';
    aside.style.cssText = cssText;
    aside.appendChild(makeKakaoIns(u.unitId, u.width, u.height));
    document.body.appendChild(aside);
  }

  function manageSidebars() {
    var existing = {
      left: document.querySelector('[data-star-sky-ad="side-left"]'),
      right: document.querySelector('[data-star-sky-ad="side-right"]'),
    };
    var wide = window.innerWidth >= SIDEBAR_MIN_VIEWPORT;
    ['left', 'right'].forEach(function (side) {
      if (wide && !existing[side]) injectSidebar(side);
      else if (!wide && existing[side]) existing[side].remove();
    });
  }

  function init() {
    if (IS_MOBILE) {
      injectMobileBottom();
    } else {
      injectDesktopBottom();
      manageSidebars();
      var resizeT;
      window.addEventListener('resize', function () {
        clearTimeout(resizeT);
        resizeT = setTimeout(manageSidebars, 200);
      });
    }
    // ins 마크업을 모두 주입한 뒤 ba.min.js를 로드해야 안전하게 광고가 채워짐.
    ensureKakaoScript();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
