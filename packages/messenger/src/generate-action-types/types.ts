import type { ESLint as eslintClass } from 'eslint';

export type ESLint = {
  instance: eslintClass;
  eslintClass: typeof eslintClass;
};
