import ts from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import * as thenableInPromiseAggregatorRaw from './lint/thenable-in-promise-aggregators.js';

const thenableInPromiseAggregator = thenableInPromiseAggregatorRaw.default;

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['lint/**/*'],
    plugins: {
      '@typescript-eslint': ts,
      custom: {
        rules: {
          'thenable-in-promise-aggregator': thenableInPromiseAggregator,
        },
      },
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { modules: true },
        ecmaVersion: 'latest',
        project: './tsconfig.json',
      },
    },
    rules: {
      ...ts.configs['eslint-recommended'].rules,
      ...ts.configs['recommended'].rules,
      '@typescript-eslint/return-await': 2,
      '@typescript-eslint/await-thenable': 2,
      '@typescript-eslint/no-explicit-any': 0,
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
        },
      ],
      'custom/thenable-in-promise-aggregator': 2,
    },
  },
];
