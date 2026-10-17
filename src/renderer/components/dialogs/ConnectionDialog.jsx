import { useEffect, useState } from 'react';
import { Alert, Button, Flex, HelperText, Loader, Modal, Select, Stack, Field } from 'xedonium';
import { engines } from '../../constants.js';
import ConnectionFields from './ConnectionFields.jsx';

const NEW_GROUP = '__new__';
const DEFAULT_GROUP = 'Connections';

// `dialog` is the object returned by useConnectionDialog; `groups` are the folders already in use.
export default function ConnectionDialog({ dialog, groups }) {
  const { open, editingId, profile, testState, formError, close, update, selectEngine, pickServiceAccount, pickSshKey, testConnection, submit } = dialog;
  const testing = testState === 'testing';
  const [creatingGroup, setCreatingGroup] = useState(false);
  useEffect(() => { if (open) setCreatingGroup(false); }, [open]);
  const groupOptions = [...new Set([DEFAULT_GROUP, ...groups])].map(group => ({ value: group, label: group }));
  const chooseGroup = value => {
    if (value === NEW_GROUP) { setCreatingGroup(true); update('group', ''); } else { setCreatingGroup(false); update('group', value); }
  };
  return (
    <Modal open={open} onClose={close} title={editingId ? 'Edit connection' : 'New connection'} as="form" noValidate onSubmit={submit} maxWidth="max-w-xl" busy={testing}
      footer={<Flex justify="end" gap={2}>
        <Button type="button" variant="secondary" disabled={testing} onClick={testConnection}>{testing ? <><Loader variant="spinner" size="sm" label="Testing" /> Testing…</> : 'Test connection'}</Button>
        <Button type="button" variant="flat" onClick={close}>Cancel</Button>
        <Button type="submit">{editingId ? 'Save changes' : 'Save connection'}</Button>
      </Flex>}>
      <Stack gap={3} className="compact-fields p-4">
        <HelperText>Credentials are encrypted before they are saved on this device.</HelperText>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Connection name" value={profile.name} onChange={value => update('name', value)} placeholder="Development database" required />
          <Select label="Folder / group" value={creatingGroup ? NEW_GROUP : (profile.group?.trim() || DEFAULT_GROUP)} onChange={chooseGroup}
            options={[...groupOptions, { value: NEW_GROUP, label: '+ New folder…' }]} />
        </div>
        {creatingGroup && <Field label="New folder name" value={profile.group || ''} onChange={value => update('group', value)} placeholder="e.g. Production" required={false} />}
        <Select label="Database type" value={profile.type} onChange={selectEngine} options={Object.entries(engines).map(([value, item]) => ({ value, label: item.label }))} />
        <ConnectionFields profile={profile} update={update} onPickServiceAccount={pickServiceAccount} onPickSshKey={pickSshKey} />
        {formError && <Alert tone={testState === 'success' ? 'success' : testState === 'failed' ? 'danger' : 'info'}>{formError}</Alert>}
      </Stack>
    </Modal>
  );
}
