// Which profile fields are secrets, and how they are hidden from / restored for the renderer. Pure functions, no
// Electron, so they can be unit tested.
const SECRET_FIELDS = ['password', 'apiKey', 'sshPassword', 'sshPassphrase', 'connectionString', 'uri'];
const MASK = '••••••••';

// Copy of a profile that is safe to hand to the renderer: every non-empty secret becomes the mask.
function redactProfile(profile) {
  const out = { ...profile };
  delete out.secretsFrom;
  for (const field of SECRET_FIELDS) if (out[field]) out[field] = MASK;
  return out;
}

// Replaces masked fields of a profile coming from the renderer with the stored values of `base`
// (the saved profile with the same id, or the one a duplicate was copied from).
function restoreSecrets(profile, base) {
  const out = { ...profile };
  delete out.secretsFrom;
  for (const field of SECRET_FIELDS) if (out[field] === MASK) out[field] = base?.[field] ?? '';
  return out;
}

module.exports = { SECRET_FIELDS, MASK, redactProfile, restoreSecrets };
