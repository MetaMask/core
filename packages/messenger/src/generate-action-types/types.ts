type LintResult = { output?: string; filePath: string };

export type ESLint = {
  instance: {
    lintFiles(files: string[]): Promise<LintResult[]>;
  };
  static: {
    outputFixes(results: LintResult[]): Promise<void>;
    getErrorResults(results: LintResult[]): LintResult[];
  };
};
