import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { CURRENT_LANG, redirectToSavedLang } from './i18n';
import { installAlternates } from './seo';

document.documentElement.lang = CURRENT_LANG === 'zh' ? 'zh-Hans' : CURRENT_LANG;
const redirected = redirectToSavedLang();
if (!redirected) installAlternates();
if (!redirected) createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
