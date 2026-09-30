import '@fontsource-variable/inter';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './shared/ui/tokens.css';
import './shared/ui/base.css';
import './features/assist/assist.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
