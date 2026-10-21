import { useState } from 'react';

// State of the "Database info" dialog: loads the details of the database being browsed each time it opens.
export default function useDatabaseInfo({ active, tree, markLost }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    if (!active) return;
    setLoading(true);
    setError('');
    const res = await window.workbench.info({ id: active.id, database: tree.currentDatabase || undefined });
    setLoading(false);
    if (!res.ok) {
      if (res.error?.unreachable || /not connected/i.test(res.error?.message || '')) markLost(active.id);
      setInfo(null);
      return setError(res.error?.message || 'Could not read the database info.');
    }
    setInfo(res.result);
  }

  function openDialog() {
    if (!active) return;
    setInfo(null);
    setOpen(true);
    load();
  }

  return { open, loading, info, error, openDialog, reload: load, close: () => setOpen(false) };
}
