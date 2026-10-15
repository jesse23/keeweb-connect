import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            'coverage/**',
            'native-messaging-host/**',
            'packages/**',
            'e2e/.cache/**',
            'e2e/.results/**'
        ]
    },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            globals: { ...globals.browser, ...globals.node, chrome: 'readonly' },
            parserOptions: {
                projectService: { allowDefaultProject: ['eslint.config.mjs'] },
                tsconfigRootDir: import.meta.dirname
            }
        },
        plugins: { 'import-x': importX, 'react-hooks': reactHooks },
        rules: {
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
            'import-x/first': 'error',
            'import-x/no-duplicates': 'error',
            // warn only: the existing sources mix alias and relative imports freely
            'import-x/order': [
                'warn',
                {
                    groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
                    'newlines-between': 'never'
                }
            ],
            'no-console': 'error',
            'no-alert': 'error',
            'no-debugger': 'error',
            'no-var': 'error',
            'prefer-const': 'error',
            eqeqeq: 'error',
            curly: 'error',
            'object-shorthand': 'error',
            'prefer-arrow-callback': 'error',
            'no-eval': 'error',
            'no-new-func': 'error',
            'no-empty': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/restrict-template-expressions': 'off',
            '@typescript-eslint/no-unnecessary-type-assertion': 'off',
            '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }]
        }
    },
    {
        files: [
            '**/*.mjs',
            'webpack.config.ts',
            'scripts/**/*.ts',
            'vitest.config.ts',
            'playwright.config.ts',
            'e2e/**/*.ts'
        ],
        rules: { 'no-console': 'off' }
    },
    {
        // Playwright fixtures: `use` is not a React hook, and fixtures take `{}` destructuring
        files: ['e2e/**/*.ts'],
        rules: { 'react-hooks/rules-of-hooks': 'off', 'no-empty-pattern': 'off' }
    },
    prettier
);
