import React from 'react';
import { Alert, Button, Flex, HelperText, Modal, Select, Stack, Field } from 'xedonium';
import { engines } from '../../constants.js';
import ConnectionFields from './ConnectionFields.jsx';

// `dialog` is the object returned by useConnectionDialog.
export default function ConnectionDialog({ dialog }) {
  const { open, editingId, profile, testState, formError, close, update, selectEngine, pickServiceAccount, pickSshKey, testConnection, submit } = dialog;
  const testing = testState === 'testing';
  return (
    <Modal open={open} onClose={close} title={editingId ? 'Edit connection' : 'New connection'} as="form" noValidate onSubmit={submit} maxWidth="max-w-xl" busy={testing}
      footer={<Flex justify="end" gap={2}>
        <Button type="button" variant="secondary" disabled={testing} onClick={testConnection}>{testing ? 'Testing…' : 'Test connection'}</Button>
        <Button type="button" variant="flat" onClick={close}>Cancel</Button>
        <Button type="submit">{editingId ? 'Save changes' : 'Save connection'}</Button>
      </Flex>}>
      <Stack gap={3} className="p-5">
        <HelperText>Credentials are encrypted before they are saved on this device.</HelperText>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Connection name" value={profile.name} onChange={value => update('name', value)} placeholder="Development database" required />
          <Field label="Folder / group" value={profile.group || ''} onChange={value => update('group', value)} placeholder="Connections" required={false} />
        </div>
        <Select label="Database type" value={profile.type} onChange={selectEngine} options={Object.entries(engines).map(([value, item]) => ({ value, label: item.label }))} />
        <ConnectionFields profile={profile} update={update} onPickServiceAccount={pickServiceAccount} onPickSshKey={pickSshKey} />
        {formError && <Alert tone={testState === 'success' ? 'success' : testState === 'failed' ? 'danger' : 'info'}>{formError}</Alert>}
      </Stack>
    </Modal>
  );
}
