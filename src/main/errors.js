// What the renderer is told about a failure. `cancelled` means the user stopped the query; `lost` means the connection dropped (it is re-opened on the next
// request); `unreachable` means there is no live connection and re-opening it failed.
function safeError(err) {
  const message = typeof err?.message === 'string' ? err.message : String(err ?? 'Unknown error');
  const code = ['string', 'number'].includes(typeof err?.code) ? err.code : null;
  return { message, code, lost: Boolean(err?.lost), unreachable: Boolean(err?.unreachable), cancelled: Boolean(err?.cancelled) };
}

const TRANSPORT_CODES = [
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', '57P01', '08006', '08001',
  'PROTOCOL_CONNECTION_LOST', 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR', 'PROTOCOL_ENQUEUE_AFTER_QUIT'
];
const TRANSPORT_MESSAGE = /connection terminated|server closed the connection|connection lost|socket hang up|not queryable|closed state|Client was closed/i;

// Firestore (gRPC) reports numeric codes: 4 DEADLINE_EXCEEDED, 14 UNAVAILABLE.
function isTransportError(err, type) {
  if (type === 'firestore' && (err?.code === 4 || err?.code === 14)) return true;
  return TRANSPORT_CODES.includes(err?.code) || TRANSPORT_MESSAGE.test(err?.message || '');
}

// Reads can safely be replayed after a reconnect; anything that might write cannot.
function isReadOnlyQuery(text) {
  const query = String(text || '').trim();
  if (/;\s*\S/.test(query)) return false;   // several statements
  return /^(select|show|describe|desc|find|read|count|distinct|collections|rest:)\b/i.test(query);
}

module.exports = { safeError, isTransportError, isReadOnlyQuery };
