const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['node_modules/*', 'docs/*', '.expo/*', 'jest.config.js', 'eslint.config.js'],
  },
  {
    rules: {
      // The PanResponder drag systems use render-time refs deliberately
      // (latest-ref mirrors, useRef(PanResponder.create()).current). This
      // React-Compiler-readiness rule flags all of them; revisit when the
      // UI is componentized in DB-103.
      'react-hooks/refs': 'off',
    },
  },
]);
