import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import LoadingScreen from './components/LoadingScreen.jsx';
import RootErrorBoundary from './components/RootErrorBoundary.jsx';
import { initErrorTracker } from './utils/errorTracker.js';
import './index.css';
import './mobile.css';

// 전역 자동 오류 캡처 — window.onerror / unhandledrejection 리스너 등록.
// React 컴포넌트 크래시는 RootErrorBoundary.componentDidCatch 가 잡는다.
initErrorTracker();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootErrorBoundary>
      <Suspense fallback={<LoadingScreen />}>
        <App />
      </Suspense>
    </RootErrorBoundary>
  </StrictMode>
);
