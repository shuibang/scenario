/* site-nav.js — 모바일 드로어 토글 + 드로어 top 좌표 동기화 */
(function () {
  const btn = document.getElementById('nav-toggle');
  if (!btn) return;
  const drawer = document.getElementById('nav-drawer');
  const backdrop = document.querySelector('.nav-drawer-backdrop');
  const headerEl = document.querySelector('.site-header');

  // 드로어/백드롭 top 좌표를 실제 헤더 높이에 맞춰 동기화 (페이지마다 헤더 높이 다름)
  function syncDrawerTop() {
    if (!headerEl) return;
    const h = headerEl.getBoundingClientRect().height;
    if (drawer)   drawer.style.top   = h + 'px';
    if (backdrop) {
      backdrop.style.top = h + 'px';
    }
    if (drawer) drawer.style.maxHeight = `calc(100dvh - ${h}px)`;
  }
  syncDrawerTop();
  window.addEventListener('resize', syncDrawerTop);

  function setOpen(open) {
    document.body.classList.toggle('nav-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
  }

  btn.addEventListener('click', () => {
    setOpen(!document.body.classList.contains('nav-open'));
  });
  backdrop && backdrop.addEventListener('click', () => setOpen(false));

  // 드로어 안에서 링크 누르면 닫기
  drawer && drawer.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => setOpen(false));
  });

  // ESC 로 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('nav-open')) {
      setOpen(false);
    }
  });

  // 데스크톱 폭으로 리사이즈되면 자동으로 닫기
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900 && document.body.classList.contains('nav-open')) {
      setOpen(false);
    }
  });
})();
