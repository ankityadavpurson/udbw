import { useState } from 'react';
import { Alert, Button, CopyIcon, Flex, Modal } from 'xedonium';
import tokenizeQuery from '../../lib/tokenize.js';

// Shown above the grid while there are unsaved edits. Apply sends them all as one transaction.
export default function PendingChangesBar({ edits, dialect = 'postgres', onCopy }) {
  const [showSql, setShowSql] = useState(false);
  const { summary, counts, applying, error, canUndo, apply, discard, undo, preview } = edits;
  if (!counts.total && !error) return null;
  const statements = showSql ? preview() : [];
  return (
    <div className="mx-2 border border-app-strong bg-app-soft/20" role="region" aria-label="Pending changes">
      <Flex gap={2} align="center" wrap className="compact-buttons px-3 py-1.5">
        <span className="text-xs font-semibold">
          {counts.total} pending change{counts.total === 1 ? '' : 's'}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-app-muted">{summary}</span>
        <Button variant="flat" tooltip="Show the statements that will run" onClick={() => setShowSql(true)} aria-haspopup="dialog">
          Preview SQL
        </Button>
        <Button variant="flat" disabled={!canUndo || applying} onClick={undo} tooltip="Undo the last change (Ctrl+Z)">
          Undo
        </Button>
        <Button variant="secondary" tooltip="Throw away all pending changes" disabled={applying} onClick={discard}>
          Discard
        </Button>
        <Button disabled={applying || !counts.total} onClick={apply} tooltip="Saves everything in one transaction (Ctrl+S)">
          {applying ? 'Applying…' : 'Apply changes'}
        </Button>
      </Flex>
      {error && (
        <div className="px-3 pb-2" role="alert">
          <Alert tone="danger">
            <span className="whitespace-pre-wrap">{error}</span>
          </Alert>
        </div>
      )}
      <Modal
        open={showSql}
        onClose={() => setShowSql(false)}
        title={`SQL preview · ${statements.length} statement${statements.length === 1 ? '' : 's'}`}
        maxWidth="max-w-3xl"
        footer={
          <Flex justify="end" gap={2} className="compact-buttons">
            <Button variant="secondary" onClick={() => onCopy?.(statements.join('\n'))}>
              <CopyIcon /> Copy SQL
            </Button>
            <Button onClick={() => setShowSql(false)}>Close</Button>
          </Flex>
        }
      >
        <div className="space-y-3 p-5">
          <p className="text-xs text-app-muted">Run in this order inside one transaction. If any statement fails, none of them are saved.</p>
          {statements.map((statement, i) => (
            <pre key={i} className="max-h-60 overflow-auto whitespace-pre-wrap break-words border border-app-border bg-app-bg p-3 font-mono text-xs leading-5">
              {(tokenizeQuery(statement, dialect)[0] || []).map((segment, j) => (
                <span key={j} style={segment.kind ? { color: `var(--xd-tok-${segment.kind})` } : undefined}>
                  {segment.text}
                </span>
              ))}
            </pre>
          ))}
        </div>
      </Modal>
    </div>
  );
}
