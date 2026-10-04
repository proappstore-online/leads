import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', 'e2e/test-results/**', 'e2e/playwright-report/**', '.husky/_/**', '.vibe-check/**'] },
  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,tsx}'],
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    plugins: { '@typescript-eslint': tseslint.plugin },
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    // TypeScript handles names and unused declarations. These rules also catch
    // cheap logic errors in the JavaScript QA scripts without type-aware linting.
    rules: {
      'constructor-super': js.configs.recommended.rules['constructor-super'],
      'no-constant-binary-expression': 'error',
      'no-debugger': 'error',
      'no-dupe-args': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'valid-typeof': 'error',
    },
  },
)
