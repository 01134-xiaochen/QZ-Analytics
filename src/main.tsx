import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import { Toaster } from 'sonner';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <App />
    <Toaster theme="dark" position="top-center" richColors />
  </HashRouter>,
);
