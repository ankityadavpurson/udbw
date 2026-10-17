import { Component } from 'react';

// Last line of defence: a crash while rendering shows this instead of a blank window, and is written to the log.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) { return { error }; }

  componentDidCatch(error, info) {
    window.workbench?.logError?.({ message: error?.message || String(error), stack: `${error?.stack || ''}\n${info?.componentStack || ''}` });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: '40rem', margin: '10vh auto' }}>
        <h1 style={{ fontSize: '1.125rem', marginBottom: '.5rem' }}>Something went wrong</h1>
        <p style={{ opacity: 0.8, marginBottom: '1rem' }}>The window hit an unexpected error. Your saved connections are not affected. Details were written to the log (Help → Open log folder).</p>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: '.75rem', opacity: 0.7, marginBottom: '1rem' }}>{String(this.state.error?.message || this.state.error)}</pre>
        <button type="button" onClick={() => window.location.reload()} style={{ padding: '.375rem .875rem', cursor: 'pointer' }}>Reload</button>
      </div>
    );
  }
}
