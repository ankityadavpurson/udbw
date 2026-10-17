import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const unused = ['error', { args: 'after-used', argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }];

export default [
  { ignores: ['dist/**', 'release/**', 'build/**', 'node_modules/**'] },
  js.configs.recommended,

  // Electron main process, preload and build scripts: CommonJS on Node.
  {
    files: ['src/main.js', 'src/main/**/*.js', 'src/preload.js', 'scripts/**/*.cjs', 'test/e2e/*.cjs', 'postcss.config.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { 'no-unused-vars': unused }
  },

  // The React UI: ES modules in the browser.
  {
    files: ['src/renderer/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: { sourceType: 'module', globals: { ...globals.browser }, parserOptions: { ecmaFeatures: { jsx: true } } },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'no-unused-vars': unused
    }
  },

  // Tests and tool configs: ES modules on Node.
  {
    files: ['test/**/*.js', 'scripts/**/*.mjs', '*.config.js', '*.config.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-unused-vars': unused }
  }
];
