import * as React from 'react';
import { StrictMode, Component, ErrorInfo, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

if (import.meta.env.DEV) {
  (window as any).__REACT_SINGLETON__ = React;
}

function extractFirstSrcLine(stack?: string) {
  if (!stack) return 'no stack';
  const lines = stack.split('\n').map(s => s.trim());
  // 找第一個包含 /src/ 或 src/ 的行
  const hit = lines.find(l => l.includes('/src/') || l.includes('src/'));
  return hit || lines[0] || 'no stack lines';
}

function ErrorInspectorView(props: { error: any }) {
  const err = props.error;
  const stack = String(err?.stack || '');
  const firstSrc = extractFirstSrcLine(stack);

  // singleton 比對：如果這裡就 false，代表 runtime 有兩份 React
  const same = import.meta.env.DEV
    ? (window as any).__REACT_SINGLETON__ === React
    : 'n/a';

  return (
    <div style={{ 
      padding: '40px', 
      color: '#333', 
      fontFamily: 'monospace',
      maxWidth: '800px',
      margin: '0 auto',
      marginTop: '5vh',
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word'
    }}>
      <h2 style={{ color: '#e11d48', marginTop: 0 }}>Something went wrong</h2>
      
      <div style={{ marginBottom: '20px', fontSize: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '15px' }}>
        <div><b>React.version:</b> {React.version}</div>
        <div><b>React singleton same?</b> <span style={{ color: same === true ? '#10b981' : '#ef4444' }}>{String(same)}</span></div>
        <div><b>First src line:</b> <span style={{ color: '#2563eb', fontWeight: 'bold' }}>{firstSrc}</span></div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <p style={{ fontWeight: 'bold', marginBottom: '8px', color: '#ef4444' }}>Error message:</p>
        <div style={{ background: '#fff1f2', padding: '12px', borderRadius: '6px', border: '1px solid #fecdd3' }}>
          {String(err?.message || err)}
        </div>
      </div>

      <details open style={{ marginTop: '20px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: '#64748b' }}>Stack Trace</summary>
        <pre style={{ 
          marginTop: '10px', 
          background: '#f8fafc', 
          padding: '15px', 
          borderRadius: '8px', 
          fontSize: '12px', 
          overflow: 'auto',
          maxHeight: '400px',
          border: '1px solid #e2e8f0'
        }}>{stack || 'no stack'}</pre>
      </details>

      <button 
        onClick={() => window.location.reload()}
        style={{
          marginTop: '30px',
          padding: '12px 24px',
          background: '#000',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontWeight: 600,
          width: '100%'
        }}
      >
        Refresh Page
      </button>
    </div>
  );
}

// Global Error Boundary
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorInspectorView error={this.state.error} />;
    }

    return this.props.children;
  }
}

// Global error handler to capture raw errors
window.addEventListener('error', e => console.error('[window.error]', e.error));
window.addEventListener('unhandledrejection', e => console.error('[unhandledrejection]', e.reason));

// Global error handler to suppress expected AbortErrors from Supabase/Vite HMR
window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason;
  if (
    error?.name === 'AbortError' || 
    error?.message?.includes('AbortError') ||
    error?.toString().includes('AbortError')
  ) {
    event.preventDefault(); // Prevent browser console error logging
  }
});

createRoot(document.getElementById('root')!).render(
  // <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  // </StrictMode>,
)
