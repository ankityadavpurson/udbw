const isSql = profile => profile.type === 'mysql' || profile.type === 'postgres';
const badPort = value => !Number(value) || Number(value) > 65535;
const sshAuthMissing = profile => (profile.sshAuthMethod === 'password' ? !profile.sshPassword : !profile.sshKeyPath);

// Each validator returns an error message, or '' when the profile is fine.

export function validateForTest(profile) {
  if (!profile.name.trim()) return 'Enter a connection name before testing.';
  if (isSql(profile) && !profile.connectionString && (!profile.host.trim() || !profile.port || !profile.database.trim() || !profile.username.trim()))
    return 'Enter the host, port, database, and username or provide a connection string.';
  if (isSql(profile) && !profile.connectionString && badPort(profile.port)) return 'Enter a valid database port between 1 and 65535.';
  if (profile.type === 'mongodb' && !profile.uri.trim()) return 'Enter a MongoDB connection URI.';
  if (profile.type === 'supabase' && !profile.connectionString && !(profile.restUrl && profile.apiKey))
    return 'Enter a PostgreSQL connection string or both the Project URL and API key.';
  if (profile.type === 'firestore' && !profile.serviceAccountPath) return 'Choose a service-account JSON file.';
  if (profile.sshEnabled && (!profile.sshHost.trim() || !profile.sshUsername.trim() || badPort(profile.sshPort) || sshAuthMissing(profile)))
    return 'Complete the SSH host, port, username, and authentication details.';
  return '';
}

export function validateForSave(profile) {
  if (profile.type === 'supabase' && !profile.connectionString && !(profile.restUrl && profile.apiKey))
    return 'Enter a PostgreSQL connection string or both the Project URL and API key.';
  if (profile.type === 'firestore' && !profile.serviceAccountPath) return 'Choose a service-account JSON file.';
  if (isSql(profile) && !profile.connectionString && badPort(profile.port)) return 'Enter a valid database port between 1 and 65535.';
  if (profile.sshEnabled && badPort(profile.sshPort)) return 'Enter a valid SSH port between 1 and 65535.';
  if (profile.sshEnabled && (!profile.sshHost.trim() || !profile.sshUsername.trim() || sshAuthMissing(profile)))
    return 'Complete the SSH host, username, and selected authentication details.';
  return '';
}
