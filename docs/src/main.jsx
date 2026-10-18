import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from 'xedonium';
import 'xedonium/styles.css';
import './styles.css';
import App from './App.jsx';
import { BASE } from './pages.js';

createRoot(document.getElementById('root')).render(
  <ThemeProvider storageKey="udbw-docs-theme">
    <BrowserRouter basename={BASE}>
      <App />
    </BrowserRouter>
  </ThemeProvider>
);
