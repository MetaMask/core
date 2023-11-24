import { ESLint } from 'eslint';

import { lintTransformedFile } from '..';

let mockESLint: any;

jest.mock('eslint', () => ({
  ESLint: class MockESLint {
    lintText: () => any;

    constructor() {
      if (mockESLint) {
        throw new Error('Mock ESLint ref already assigned!');
      }

      // eslint-disable-next-line @typescript-eslint/no-this-alias, consistent-this
      mockESLint = this;

      // eslint-disable-next-line jest/prefer-spy-on
      this.lintText = jest.fn();
    }
  },
}));

mockESLint = new ESLint();

describe('transform utils', () => {
  describe('lintTransformedFile', () => {
    it('returns if linting passes with no errors', async () => {
      mockESLint.lintText.mockImplementationOnce(async () =>
        Promise.resolve([{ errorCount: 0 }]),
      );

      expect(
        await lintTransformedFile(mockESLint, '/* JavaScript */', 'file.js'),
      ).toBeUndefined();
    });

    it('throws if the file is ignored by ESLint', async () => {
      mockESLint.lintText.mockImplementationOnce(async () =>
        Promise.resolve([]),
      );

      await expect(async () =>
        lintTransformedFile(mockESLint, '/* JavaScript */', 'file.js'),
      ).rejects.toThrow(
        /Transformed file "file\.js" appears to be ignored by ESLint\.$/u,
      );
    });

    it('throws if linting produced any errors', async () => {
      const ruleId = 'some-eslint-rule';
      const message = 'You violated the rule!';

      mockESLint.lintText.mockImplementationOnce(async () =>
        Promise.resolve([
          { errorCount: 1, messages: [{ message, ruleId, severity: 2 }] },
        ]),
      );

      await expect(async () =>
        lintTransformedFile(mockESLint, '/* JavaScript */', 'file.js'),
      ).rejects.toThrow(
        /Lint errors encountered for transformed file "file\.js":\n\n {4}some-eslint-rule\n {4}You violated the rule!\n\n$/u,
      );
    });

    // Contrived case for coverage purposes
    it('handles missing rule ids', async () => {
      const ruleId = null;
      const message = 'You violated the rule!';

      mockESLint.lintText.mockImplementationOnce(async () =>
        Promise.resolve([
          { errorCount: 1, messages: [{ message, ruleId, severity: 2 }] },
        ]),
      );

      await expect(async () =>
        lintTransformedFile(mockESLint, '/* JavaScript */', 'file.js'),
      ).rejects.toThrow(
        /Lint errors encountered for transformed file "file\.js":\n\n {4}<Unknown rule>\n {4}You violated the rule!\n\n$/u,
      );
    });
  });
});
