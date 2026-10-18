export const engines = {
  mysql: { label: 'MySQL', icon: 'MY', query: 'SELECT 1 AS connection_test;', help: 'SQL mode · MySQL queries execute on the selected database.' },
  postgres: { label: 'PostgreSQL', icon: 'PG', query: 'SELECT 1 AS connection_test;', help: 'SQL mode · PostgreSQL queries execute on the selected database.' },
  mongodb: {
    label: 'MongoDB',
    icon: 'MO',
    query: 'collections',
    help: 'Mongo mode · collections · find users {"age":{"$gt":30}} SORT {"age":-1} LIMIT 20 · count · aggregate · or db.users.find({ … }).'
  },
  supabase: { label: 'Supabase', icon: 'SB', query: 'SELECT current_database(), current_user;', help: 'SQL mode uses PostgreSQL. REST mode: REST: table_name LIMIT 100' },
  firestore: {
    label: 'Firebase Firestore',
    icon: 'FS',
    query: 'collections',
    help: 'Firestore mode · collections · read users WHERE age >= 18 ORDER BY age DESC LIMIT 20 · count users · users/abc/orders for subcollections.'
  }
};

export const blankProfile = {
  name: '',
  type: 'mysql',
  host: '',
  port: '3306',
  database: '',
  username: '',
  password: '',
  uri: '',
  connectionString: '',
  restUrl: '',
  apiKey: '',
  projectId: '',
  serviceAccountPath: '',
  ssl: false,
  sslAllowUntrusted: false,
  environment: '',
  readOnly: false,
  sshEnabled: false,
  sshHost: '',
  sshPort: '22',
  sshUsername: '',
  sshAuthMethod: 'password',
  sshPassword: '',
  sshKeyPath: '',
  sshPassphrase: '',
  sshRemoteHost: ''
};

export const blankTab = {
  id: 'blank',
  connId: null,
  title: '',
  query: '',
  result: null,
  error: '',
  meta: 'No query executed',
  view: 'table',
  viewPinned: false,
  running: false,
  selected: [],
  selectedObject: null
};

// Saved secrets stay in the main process; the UI holds this placeholder for them and the main process swaps the
// real value back in. Anything typed over a placeholder replaces the stored secret.
export const SECRET_FIELDS = ['password', 'apiKey', 'sshPassword', 'sshPassphrase', 'connectionString', 'uri'];
export const SECRET_MASK = '••••••••';

export const NAV_STORAGE_KEY = 'udw-nav-collapsed';
