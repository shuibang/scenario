/**
 * 정적 marketing/info 페이지 (/, /help, /notice, /changelog, /about, ...) 공통 광고 주입기.
 *
 * 광고 매체: 카카오 애드핏 (모든 자리). unit ID는 사이즈/위치별로 1개씩 고정 발급된 것을 사용.
 *
 * 구성:
 *  - 좌/우 sticky 세로 광고 (160×600): 1280px+ 뷰포트에서만 노출
 *  - 페이지 하단 가로 분할 광고 (320×100): 0~639px=1개, 640~1023px=2개, 1024px+=3개
 *
 * 카카오 애드핏 정책: 같은 unit ID를 같은 페이지에 중복 노출 금지 → 각 자리마다 별개 unit ID 사용.
 */
(function () {
  if (window.__STAR_SKY_STATIC_ADS_LOADED__) return;
  window.__STAR_SKY_STATIC_ADS_LOADED__ = true;

  var KAKAO_SCRIPT_SRC = 'https://t1.kakaocdn.net/kas/static/ba.min.js';
  var SIDEBAR_MIN_VIEWPORT = 1280;

  var SIDE_UNITS = {
    left:  { unitId: 'DAN-vosrnMrXTMbPT4Ra', width: 160, height: 600 },
    right: { unitId: 'DAN-hEPeSbjeJS64O2IW', width: 160, height: 600 },
  };

  // 하단 분할 — 뷰포트 폭이 커질수록 점진 노출 (0~639px=1, 640~1023=2, 1024+=3)
  var BOTTOM_UNITS = [
    { unitId: 'DAN-EhfVcuvQrMF6L8Fk', width: 320, height: 100 },
    { unitId: 'DAN-NFFbgh61gOXktpCt', width: 320, height: 100 },
    { unitId: 'DAN-Wd3EArOUReEfw07C', width: 320, height: 100 },
  ];

  function ensureKakaoScript() {
    if (document.querySelector('script[data-kakao-ads-loaded="1"]')) return;
    var s = document.createElement('script');
    s.async = true;
    s.src = KAKAO_SCRIPT_SRC;
    s.dataset.kakaoAdsLoaded = '1';
    document.head.appendChild(s);
  }

  function makeIns(unitId, width, height) {
    var ins = document.createElement('ins');
    ins.className = 'kakao_ad_area';
    ins.style.display = 'none';
    ins.setAttribute('data-ad-unit', unitId);
    ins.setAttribute('data-ad-width', String(width));
    ins.setAttribute('data-ad-height', String(height));
    return ins;
  }

  function injectSidebar(side) {
    var u = SIDE_UNITS[side];
    var aside = document.createElement('aside');
    aside.dataset.starSkyAd = 'side-' + side;
    aside.setAttribute('aria-label', '광고');
    var cssText = 'position:fixed;top:120px;width:' + u.width + 'px;height:' + u.height + 'px;z-index:5;pointer-events:auto;';
    cssText += side + ':16px;';
    aside.style.cssText = cssText;
    aside.appendChild(makeIns(u.unitId, u.width, u.height));
    document.body.appendChild(aside);
  }

  function manageSidebars() {
    var existing = {
      left: document.querySelector('[data-star-sky-ad="side-left"]'),
      right: document.querySelector('[data-star-sky-ad="side-right"]'),
    };
    var wide = window.innerWidth >= SIDEBAR_MIN_VIEWPORT;
    ['left', 'right'].forEach(function (side) {
      if (wide && !existing[side]) {
        injectSidebar(side);
      } else if (!wide && existing[side]) {
        existing[side].remove();
      }
    });
  }

  function injectBottomGrid() {
    var wrap = document.createElement('div');
    wrap.dataset.starSkyAd = 'bottom-grid';
    wrap.setAttribute('aria-label', '광고');
    wrap.style.cssText =
      'display:flex;flex-wrap:nowrap;gap:8px;justify-content:center;align-items:center;' +
      'width:100%;max-width:1080px;margin:32px auto 16px;padding:0 16px;' +
      'box-sizing:border-box;overflow:hidden;';

    BOTTOM_UNITS.forEach(function (u, i) {
      var card = document.createElement('div');
      card.dataset.starSkyAdSlot = String(i + 1);
      // flex:0 1 — 폭이 좁으면 카드 자체가 줄어들도록 허용.
      // 카카오 ins는 사이즈 고정이라 카드 안에서 overflow되면 부모 wrap의 overflow:hidden으로 잘림.
      card.style.cssText =
        'flex:0 1 ' + u.width + 'px;max-width:100%;height:' + u.height + 'px;' +
        'display:flex;justify-content:center;align-items:center;overflow:hidden;';
      card.appendChild(makeIns(u.unitId, u.width, u.height));
      wrap.appendChild(card);
    });

    if (!document.getElementById('star-sky-ad-styles')) {
      var st = document.createElement('style');
      st.id = 'star-sky-ad-styles';
      st.textContent =
        '@media (max-width:639px){[data-star-sky-ad="bottom-grid"] [data-star-sky-ad-slot="2"],' +
        '[data-star-sky-ad="bottom-grid"] [data-star-sky-ad-slot="3"]{display:none;}}' +
        '@media (min-width:640px) and (max-width:1023px){[data-star-sky-ad="bottom-grid"] [data-star-sky-ad-slot="3"]{display:none;}}';
      document.head.appendChild(st);
    }

    var footer = document.querySelector('footer, .site-footer, .footer');
    if (footer && footer.parentNode) {
      footer.parentNode.insertBefore(wrap, footer);
    } else {
      document.body.appendChild(wrap);
    }
  }

  function init() {
    manageSidebars();
    injectBottomGrid();
    // ins 마크업을 모두 주입한 뒤 ba.min.js를 로드해야 안전하게 광고가 채워짐.
    ensureKakaoScript();

    var resizeT;
    window.addEventListener('resize', function () {
      clearTimeout(resizeT);
      resizeT = setTimeout(manageSidebars, 200);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
