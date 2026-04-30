import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import LoadingScreen from './components/LoadingScreen.jsx';
import './index.css';
import './mobile.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={<LoadingScreen />}>
      <App />
    </Suspense>
  </StrictMode>
);
