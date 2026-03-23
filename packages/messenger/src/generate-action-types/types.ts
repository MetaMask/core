import type { ESLint as ESLintClass } from 'eslint';

export type ESLint = {
  instance: ESLintClass;
  outputFixes: typeof ESLintClass.outputFixes;
  getErrorResults: typeof ESLintClass.getErrorResults;
};
