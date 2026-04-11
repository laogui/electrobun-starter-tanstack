import { defineConfig } from 'oxlint';
import core from 'ultracite/oxlint/core';
import react from 'ultracite/oxlint/react';
import remix from 'ultracite/oxlint/remix';
import vitest from 'ultracite/oxlint/vitest';

export default defineConfig({
  extends: [core, react, remix, vitest],
  rules: {
    quotes: ['error', 'single'],
    'ssr-friendly/no-dom-globals-in-module-scope': 'off',
    'func-style': ['error', 'declaration', { allowArrowFunctions: true }],
    'react/no-unknown-property': 'off',
    'jsonc/sort-keys': 'off',
    'react-refresh/only-export-components': 'off',
    'eslint-plugin-sort-destructure-keys-typescript/sort-jsx-attributes-by-type':
      'off',
    'antfu/no-top-level-await': 'off',
  },
});
