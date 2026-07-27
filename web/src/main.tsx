import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n/config';
import App from './App.tsx';
import { bootstrapClientPreferences } from './lib/clientPreferences';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

async function start() {
  await bootstrapClientPreferences();
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
