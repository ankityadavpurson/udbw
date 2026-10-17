import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'xedonium';
import 'xedonium/styles.css';
import '../styles.css';
import App from './App.jsx';
import ThemeBridge from './components/ThemeBridge.jsx';

createRoot(document.getElementById('root')).render(
  <ThemeProvider storageKey="universal-db-theme">
    <ThemeBridge />
    <App />
  </ThemeProvider>
);
