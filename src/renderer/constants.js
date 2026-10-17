export const engines = {
  mysql: { label: 'MySQL', icon: 'MY', query: 'SELECT 1 AS connection_test;', help: 'SQL mode · MySQL queries execute on the selected database.' },
  postgres: { label: 'PostgreSQL', icon: 'PG', query: 'SELECT 1 AS connection_test;', help: 'SQL mode · PostgreSQL queries execute on the selected database.' },
  mongodb: { label: 'MongoDB', icon: 'MO', query: 'collections', help: 'Mongo mode · Use “collections” or find collection_name {"status":"active"} LIMIT 100.' },
  supabase: { label: 'Supabase', icon: 'SB', query: 'SELECT current_database(), current_user;', help: 'SQL mode uses PostgreSQL. REST mode: REST: table_name LIMIT 100' },
  firestore: { label: 'Firebase Firestore', icon: 'FS', query: 'collections', help: 'Firestore mode · Use “collections” or “read collection_name LIMIT 100”.' }
};

export const blankProfile = {
  name: '', type: 'mysql', host: '', port: '3306', database: '', username: '', password: '', uri: '', connectionString: '',
  restUrl: '', apiKey: '', projectId: '', serviceAccountPath: '', ssl: false, sslAllowUntrusted: false, sshEnabled: false,
  sshHost: '', sshPort: '22', sshUsername: '', sshAuthMethod: 'password', sshPassword: '', sshKeyPath: '', sshPassphrase: '', sshRemoteHost: ''
};

export const blankTab = {
  id: 'blank', connId: null, title: '', query: '', result: null, error: '', meta: 'No query executed',
  view: 'table', viewPinned: false, running: false, selected: [], selectedObject: null
};

export const NAV_STORAGE_KEY = 'udw-nav-collapsed';
