import type { ESLint as eslintClass } from 'eslint';

export type ESLint = {
  instance: eslintClass;
  eslintClass: typeof eslintClass;
};

/**
 * The formatting tool to use for formatting the source code.
 */
export type Formatter = 'oxfmt' | 'prettier';
