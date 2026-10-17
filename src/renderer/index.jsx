import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'xedonium';
import 'xedonium/styles.css';
import '../styles.css';
import App from './App.jsx';
import ThemeBridge from './components/ThemeBridge.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

// Errors that escape React (event handlers, promises) go to the log too.
window.addEventListener('error', event => window.workbench?.logError?.({ message: event.message, stack: event.error?.stack }));
window.addEventListener('unhandledrejection', event => window.workbench?.logError?.({ message: String(event.reason?.message || event.reason), stack: event.reason?.stack }));

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <ThemeProvider storageKey="universal-db-theme">
      <ThemeBridge />
      <App />
    </ThemeProvider>
  </ErrorBoundary>
);
