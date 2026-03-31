import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

// ── v2 toggle ─────────────────────────────────────────────────────────────────
// Switch between v1 and v2 via:
//   localStorage.setItem('app_version', '2'); location.reload()
//   localStorage.setItem('app_version', '1'); location.reload()
// Or URL param: ?v=2 or ?v=1
const urlV = new URLSearchParams(location.search).get('v');
if (urlV === '2' || urlV === '1') localStorage.setItem('app_version', urlV);
const appVersion = localStorage.getItem('app_version') || '1';

async function mountApp() {
  if (appVersion === '2') {
    const { default: V2App } = await import('./v2/V2App.jsx');
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <V2App />
      </StrictMode>
    );
  } else {
    const { default: App } = await import('./App.jsx');
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  }
}

mountApp();
