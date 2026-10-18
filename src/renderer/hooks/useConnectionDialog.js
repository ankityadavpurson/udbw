import { useState } from 'react';
import { blankProfile } from '../constants.js';
import { validateForSave, validateForTest } from '../lib/validation.js';

// State of the New / Edit connection dialog: form values, test result and submit.
export default function useConnectionDialog({ connected, saveProfile, onSaved }) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [profile, setProfile] = useState(blankProfile);
  const [testState, setTestState] = useState('idle');
  const [formError, setFormError] = useState('');

  function openDialog(existing = null) {
    setEditingId(existing?.id || null);
    setProfile(existing ? { ...blankProfile, ...existing } : { ...blankProfile });
    setTestState('idle');
    setFormError('');
    setOpen(true);
  }
  const close = () => setOpen(false);

  function update(key, value) {
    setTestState('idle');
    setProfile(p => ({ ...p, [key]: value }));
  }

  function selectEngine(type) {
    setTestState('idle');
    setProfile(p => ({ ...p, type, sshEnabled: type === 'firestore' ? false : p.sshEnabled, port: type === 'postgres' ? '5432' : '3306' }));
  }

  async function pickServiceAccount() {
    const path = await window.workbench.pickServiceAccount();
    if (path) update('serviceAccountPath', path);
  }
  async function pickSshKey() {
    const path = await window.workbench.pickSshKey();
    if (path) update('sshKeyPath', path);
  }

  async function testConnection() {
    const problem = validateForTest(profile);
    if (problem) return setFormError(problem);
    setTestState('testing');
    setFormError('Testing connection…');
    try {
      const tested = await window.workbench.test({ profile: { ...profile, name: profile.name.trim() }, id: editingId });
      if (tested.ok) {
        setTestState('success');
        setFormError('Connection test succeeded. Save when ready.');
      } else {
        setTestState('failed');
        setFormError(`Connection test failed: ${tested.error?.message || 'Check the connection settings.'}`);
      }
    } catch (err) {
      // IPC can reject when the main process or a driver fails before returning its normal { ok, error } response.
      setTestState('failed');
      setFormError(`Connection test failed: ${err?.message || 'The database driver could not complete the test.'}`);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setFormError('');
    const problem = validateForSave(profile);
    if (problem) return setFormError(problem);
    if (editingId && connected.includes(editingId) && testState !== 'success')
      return setFormError('Test the edited settings successfully before replacing the active saved configuration.');
    const saved = await saveProfile({ profile, editingId });
    onSaved?.(saved.next, saved.existing);
    setOpen(false);
  }

  return { open, editingId, profile, testState, formError, openDialog, close, update, selectEngine, pickServiceAccount, pickSshKey, testConnection, submit };
}
