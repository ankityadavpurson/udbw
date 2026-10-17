import React from 'react';

const colors = {
  connected: 'bg-green-500',
  connecting: 'animate-pulse bg-amber-500',
  failed: 'bg-red-500'
};

export default function StatusDot({ state, className = '' }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${colors[state] || 'bg-app-border'} ${className}`} role="img" aria-label={state || 'disconnected'} />;
}
