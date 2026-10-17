import React from 'react';
import { Alert, Button, Checkbox, Divider, Field, Flex, HelperText, PasswordInput, Select, Stack } from 'xedonium';

// Engine-specific form fields of the connection dialog.
export default function ConnectionFields({ profile, update, onPickServiceAccount, onPickSshKey }) {
  const upd = key => value => update(key, value);

  const textField = (label, key, placeholder, { required = false, type = 'text', helperText } = {}) => (
    <Field key={key} label={label} type={type} value={profile[key] || ''} onChange={upd(key)} placeholder={placeholder} required={required} helperText={helperText} />
  );
  const secretField = (label, key, placeholder) => (
    <PasswordInput key={key} label={label} value={profile[key] || ''} onChange={upd(key)} placeholder={placeholder} autoComplete="off" />
  );
  const pathField = (label, key, placeholder, onPick, buttonLabel) => (
    <Flex align="end" gap={2}>
      <div className="min-w-0 flex-1"><Field label={label} value={profile[key] || ''} onChange={() => {}} placeholder={placeholder} readOnly required /></div>
      <Button type="button" onClick={onPick}>{buttonLabel}</Button>
    </Flex>
  );

  const sslFields = (label = 'Use TLS/SSL') => (
    <Stack gap={2}>
      <Checkbox label={label} checked={profile.ssl} onChange={upd('ssl')} />
      {profile.ssl && <Checkbox label="Allow untrusted / self-signed certificate" description="Disables certificate verification. Use only for hosts you trust." checked={profile.sslAllowUntrusted} onChange={upd('sslAllowUntrusted')} />}
    </Stack>
  );

  const sshFields = () => {
    if (profile.type === 'firestore' || (profile.type === 'supabase' && !profile.connectionString)) return null;
    return (
      <Stack gap={3}>
        <Divider />
        <Checkbox label="Connect through an SSH tunnel" checked={profile.sshEnabled} onChange={upd('sshEnabled')} />
        {profile.sshEnabled && <>
          <div className="grid grid-cols-2 gap-3">{textField('SSH host', 'sshHost', 'bastion.example.com', { required: true })}{textField('SSH port', 'sshPort', '22', { required: true, type: 'number' })}</div>
          <div className="grid grid-cols-2 gap-3">
            {textField('SSH username', 'sshUsername', 'ssh_user', { required: true })}
            <Select label="SSH authentication" value={profile.sshAuthMethod} onChange={upd('sshAuthMethod')} options={[{ value: 'password', label: 'Password' }, { value: 'privateKey', label: 'Private key' }]} />
          </div>
          {profile.sshAuthMethod === 'password'
            ? secretField('SSH password', 'sshPassword', 'Password')
            : <>{pathField('SSH private key', 'sshKeyPath', 'Choose a private key', onPickSshKey, 'Choose key')}{secretField('Key passphrase (optional)', 'sshPassphrase', 'Passphrase')}</>}
          {textField('Remote database host (optional)', 'sshRemoteHost', 'Defaults to the database host')}
        </>}
      </Stack>
    );
  };

  if (profile.type === 'mysql' || profile.type === 'postgres') return <>
    {secretField('Connection string (optional)', 'connectionString', profile.type === 'mysql' ? 'mysql://user:password@host:3306/database' : 'postgresql://user:password@host:5432/database')}
    {!profile.connectionString && <>
      <div className="grid grid-cols-[1fr_8rem] gap-3">{textField('Host', 'host', 'db.example.com', { required: true })}{textField('Port', 'port', profile.type === 'mysql' ? '3306' : '5432', { required: true, type: 'number' })}</div>
      <div className="grid grid-cols-2 gap-3">{textField('Database', 'database', 'database_name', { required: true })}{textField('Username', 'username', 'db_user', { required: true })}</div>
      {secretField('Password', 'password', 'Password')}
    </>}
    {sslFields()}{sshFields()}
  </>;

  if (profile.type === 'mongodb') return <>
    {secretField('MongoDB URI', 'uri', 'mongodb+srv://user:password@cluster.example.mongodb.net/')}
    {textField('Database (optional)', 'database', 'database_name', { helperText: 'Authentication is configured in the URI.' })}
    {sshFields()}
  </>;

  if (profile.type === 'supabase') return <>
    {secretField('PostgreSQL connection string', 'connectionString', 'postgresql://user:password@host:5432/postgres')}
    <HelperText>Find it in Project Settings → Database → Connection string.</HelperText>
    <div className="grid grid-cols-2 gap-3">{textField('Project URL (optional REST)', 'restUrl', 'https://your-project.supabase.co')}{secretField('API key (optional REST)', 'apiKey', 'Publishable / anon key')}</div>
    <HelperText>Without a connection string, both REST fields are required.</HelperText>
    {sslFields('Use TLS/SSL for PostgreSQL')}{sshFields()}
  </>;

  return <>
    {pathField('Service-account JSON file', 'serviceAccountPath', 'Choose a JSON key file', onPickServiceAccount, 'Choose file')}
    {textField('Firebase project ID (optional)', 'projectId', 'my-firebase-project')}
    <Alert tone="warning">Firestore Admin SDK credentials bypass Firestore Security Rules. Use a dedicated, least-privilege service account.</Alert>
  </>;
}
