import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { registerServiceWorker } from '@/pwa/register';
import '@/styles/base.css';
import '@/styles/components.css';

const container = document.getElementById('root');
if (!container) throw new Error('Élément racine introuvable');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
