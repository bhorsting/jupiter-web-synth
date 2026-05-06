import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Register service worker for PWA
const updateSW = registerSW({
  onNeedRefresh() {
    // Only prompt if we haven't prompted in the last 30 seconds
    const lastUpdatePrompt = sessionStorage.getItem('last-update-prompt');
    const now = Date.now();
    if (!lastUpdatePrompt || now - parseInt(lastUpdatePrompt) > 30000) {
      sessionStorage.setItem('last-update-prompt', now.toString());
      if (confirm('A new update is available. Refresh to apply?')) {
        updateSW(true);
      }
    }
  },
  onOfflineReady() {
    console.log('App ready for offline use');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
