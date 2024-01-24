import { removeFencedCode } from '..';
import type { FeatureLabels } from '..';
import {
  DirectiveCommand,
  multiSplice,
  validateCommand,
} from './remove-fenced-code';

const FEATURE_A = 'feature-a';
const FEATURE_B = 'feature-b';
const FEATURE_C = 'feature-c';

const getFeatures = ({ all, active }: FeatureLabels) => ({
  all: new Set(all),
  active: new Set(active),
});

const getFencedCode = (...params: string[]) =>
  `///: BEGIN:ONLY_INCLUDE_IF(${params.join(',')})
Conditionally_Included
///: END:ONLY_INCLUDE_IF
`;

const getUnfencedCode = () => `
Always included
Always included
Always included
`;

const join = (...args: string[]) => args.join('\n');

describe('build transforms', () => {
  describe('removeFencedCode', () => {
    const mockFileName = 'file.js';

    it('transforms file consisting of single fence pair', () => {
      expect(
        removeFencedCode(
          mockFileName,
          getFencedCode(FEATURE_A),
          getFeatures({
            active: new Set([FEATURE_B]),
            all: new Set([FEATURE_B, FEATURE_A]),
          }),
        ),
      ).toStrictEqual(['', true]);
    });

    (
      [
        [
          join(
            getFencedCode(FEATURE_A),
            getUnfencedCode(),
            getFencedCode(FEATURE_C),
          ),
          join('', getUnfencedCode(), ''),
        ],

        [
          join(
            getFencedCode(FEATURE_A),
            getFencedCode(FEATURE_B),
            getFencedCode(FEATURE_C),
          ),
          join('', getFencedCode(FEATURE_B), ''),
        ],

        [
          join(
            getFencedCode(FEATURE_A),
            getUnfencedCode(),
            getFencedCode(FEATURE_B),
            getFencedCode(FEATURE_C),
            getUnfencedCode(),
            getFencedCode(FEATURE_A),
            getFencedCode(FEATURE_B),
          ),
          join(
            '',
            getUnfencedCode(),
            getFencedCode(FEATURE_B),
            '',
            getUnfencedCode(),
            '',
            getFencedCode(FEATURE_B),
          ),
        ],

        [
          join(
            getUnfencedCode(),
            getFencedCode(FEATURE_A),
            getFencedCode(FEATURE_B),
            getFencedCode(FEATURE_B),
            getFencedCode(FEATURE_C),
            getFencedCode(FEATURE_C),
            getUnfencedCode(),
            getFencedCode(FEATURE_A),
            getFencedCode(FEATURE_A),
            getFencedCode(FEATURE_B),
          ),
          join(
            getUnfencedCode(),
            '',
            getFencedCode(FEATURE_B),
            getFencedCode(FEATURE_B),
            '',
            '',
            getUnfencedCode(),
            '',
            '',
            getFencedCode(FEATURE_B),
          ),
        ],
      ] as const
    ).forEach(([input, expected], i) => {
      it(`removes multiple fences from file ${i}`, () => {
        expect(
          removeFencedCode(
            mockFileName,
            input,
            getFeatures({
              active: new Set([FEATURE_B]),
              all: new Set([FEATURE_A, FEATURE_B, FEATURE_C]),
            }),
          ),
        ).toStrictEqual([expected, true]);
      });
    });

    (
      [
        [
          [FEATURE_A],
          join(
            getFencedCode(FEATURE_A, FEATURE_B),
            getUnfencedCode(),
            getFencedCode(FEATURE_C),
          ),
          join(getFencedCode(FEATURE_A, FEATURE_B), getUnfencedCode(), ''),
          true,
        ],

        [
          [FEATURE_A],
          join(
            getFencedCode(FEATURE_A, FEATURE_B),
            getUnfencedCode(),
            getFencedCode(FEATURE_C, FEATURE_B),
          ),
          join(getFencedCode(FEATURE_A, FEATURE_B), getUnfencedCode(), ''),
          true,
        ],

        [
          [FEATURE_B],
          join(
            getFencedCode(FEATURE_A, FEATURE_B, FEATURE_C),
            getUnfencedCode(),
            getFencedCode(FEATURE_C),
          ),
          join(
            getFencedCode(FEATURE_A, FEATURE_B, FEATURE_C),
            getUnfencedCode(),
            '',
          ),
          true,
        ],

        [
          [FEATURE_B],
          join(
            getFencedCode(FEATURE_A, FEATURE_B, FEATURE_C),
            getUnfencedCode(),
            getFencedCode(FEATURE_C, FEATURE_A),
          ),
          join(
            getFencedCode(FEATURE_A, FEATURE_B, FEATURE_C),
            getUnfencedCode(),
            '',
          ),
          true,
        ],

        [
          [FEATURE_A, FEATURE_B],
          join(
            getFencedCode(FEATURE_A, FEATURE_B, FEATURE_C),
            getUnfencedCode(),
            getFencedCode(FEATURE_C),
          ),
          join(
            getFencedCode(FEATURE_A, FEATURE_B, FEATURE_C),
            getUnfencedCode(),
            '',
          ),
          true,
        ],

        [
          [FEATURE_A, FEATURE_B, FEATURE_C],
          join(
            getFencedCode(FEATURE_A, FEATURE_B, FEATURE_C),
            getUnfencedCode(),
            getFencedCode(FEATURE_C),
          ),
          join(
            getFencedCode(FEATURE_A, FEATURE_B, FEATURE_C),
            getUnfencedCode(),
            getFencedCode(FEATURE_C),
          ),
          false,
        ],
      ] as const
    ).forEach(([activeFeatures, input, expected, modified], i) => {
      it(`removes or keeps multi-parameter fences ${i}`, () => {
        expect(
          removeFencedCode(
            mockFileName,
            input,
            getFeatures({
              active: new Set(activeFeatures),
              all: new Set([FEATURE_A, FEATURE_B, FEATURE_C]),
            }),
          ),
        ).toStrictEqual([expected, modified]);
      });
    });

    [
      getFencedCode(FEATURE_A),

      join(
        getFencedCode(FEATURE_A),
        getUnfencedCode(),
        getFencedCode(FEATURE_C),
      ),

      join(getUnfencedCode(), getFencedCode(FEATURE_C)),
    ].forEach((input, i) => {
      it(`does not transform files with only inactive fences ${i}`, () => {
        expect(
          removeFencedCode(
            mockFileName,
            input,
            getFeatures({
              active: new Set([FEATURE_A, FEATURE_C]),
              all: new Set([FEATURE_A, FEATURE_C]),
            }),
          ),
        ).toStrictEqual([input, false]);
      });
    });

    it('ignores sentinels preceded by non-whitespace', () => {
      const validBeginDirective = '///: BEGIN:ONLY_INCLUDE_IF(feature-b)\n';
      const ignoredLines = [
        `a ${validBeginDirective}`,
        `2 ${validBeginDirective}`,
        `@ ${validBeginDirective}`,
      ];

      ignoredLines.forEach((ignoredLine) => {
        // These inputs will be transformed
        expect(
          removeFencedCode(
            mockFileName,
            getFencedCode(FEATURE_A).concat(ignoredLine),
            getFeatures({
              active: new Set([FEATURE_B]),
              all: new Set([FEATURE_B, FEATURE_A]),
            }),
          ),
        ).toStrictEqual([ignoredLine, true]);

        const modifiedInputWithoutFences =
          getUnfencedCode().concat(ignoredLine);

        // These inputs will not be transformed
        expect(
          removeFencedCode(
            mockFileName,
            modifiedInputWithoutFences,
            getFeatures({
              active: new Set([FEATURE_B]),
              all: new Set([FEATURE_B]),
            }),
          ),
        ).toStrictEqual([modifiedInputWithoutFences, false]);
      });
    });

    // Invalid inputs
    it('rejects empty fences', () => {
      const jsComment = '// A comment\n';

      const emptyFence = getFencedCode(FEATURE_B)
        .split('\n')
        .filter((line) => line.startsWith('///:'))
        .map((line) => `${line}\n`)
        .join('');

      const emptyFenceWithPrefix = jsComment.concat(emptyFence);
      const emptyFenceWithSuffix = emptyFence.concat(jsComment);
      const emptyFenceSurrounded = emptyFenceWithPrefix.concat(jsComment);

      const inputs = [
        emptyFence,
        emptyFenceWithPrefix,
        emptyFenceWithSuffix,
        emptyFenceSurrounded,
      ];

      inputs.forEach((input) => {
        expect(() =>
          removeFencedCode(
            mockFileName,
            input,
            getFeatures({
              active: new Set([FEATURE_B]),
              all: new Set([FEATURE_B]),
            }),
          ),
        ).toThrow(
          `Empty fence found in file "${mockFileName}":\n${emptyFence}`,
        );
      });
    });

    it('rejects sentinels not followed by a single space and a multi-character alphabetical string', () => {
      // Matches the sentinel and terminus component of the first line
      // beginning with "///: TERMINUS"
      const fenceSentinelAndTerminusRegex = /^\/\/\/: \w+/mu;

      const replacements = [
        '///:BEGIN',
        '///:XBEGIN',
        '///:_BEGIN',
        '///:B',
        '///:_',
        '///: ',
        '///: B',
        '///:',
      ];

      replacements.forEach((replacement) => {
        expect(() =>
          removeFencedCode(
            mockFileName,
            getFencedCode(FEATURE_B).replace(
              fenceSentinelAndTerminusRegex,
              replacement,
            ),
            getFeatures({
              active: new Set([FEATURE_B]),
              all: new Set([FEATURE_B]),
            }),
          ),
        ).toThrow(
          /Fence sentinel must be followed by a single space and an alphabetical string of two or more characters.$/u,
        );
      });
    });

    it('rejects malformed BEGIN directives', () => {
      // This is the first line of the minimal input template
      const directiveString = '///: BEGIN:ONLY_INCLUDE_IF(feature-b)';

      const replacements = [
        // Invalid terminus
        '///: BE_GIN:BEGIN:ONLY_INCLUDE_IF(feature-b)',
        '///: BE6IN:BEGIN:ONLY_INCLUDE_IF(feature-b)',
        '///: BEGIN7:BEGIN:ONLY_INCLUDE_IF(feature-b)',
        '///: BeGIN:ONLY_INCLUDE_IF(feature-b)',
        '///: BE3:BEGIN:ONLY_INCLUDE_IF(feature-b)',
        '///: BEG-IN:BEGIN:ONLY_INCLUDE_IF(feature-b)',
        '///: BEG N:BEGIN:ONLY_INCLUDE_IF(feature-b)',

        // Invalid commands
        '///: BEGIN:ONLY-INCLUDE_IF(flask)',
        '///: BEGIN:ONLY_INCLUDE:IF(flask)',
        '///: BEGIN:ONL6_INCLUDE_IF(flask)',
        '///: BEGIN:ONLY_IN@LUDE_IF(flask)',
        '///: BEGIN:ONLy_INCLUDE_IF(feature-b)',
        '///: BEGIN:ONLY INCLUDE_IF(flask)',

        // Invalid parameters
        '///: BEGIN:ONLY_INCLUDE_IF(,flask)',
        '///: BEGIN:ONLY_INCLUDE_IF(feature-b,)',
        '///: BEGIN:ONLY_INCLUDE_IF(feature-b,,main)',
        '///: BEGIN:ONLY_INCLUDE_IF(,)',
        '///: BEGIN:ONLY_INCLUDE_IF()',
        '///: BEGIN:ONLY_INCLUDE_IF( )',
        '///: BEGIN:ONLY_INCLUDE_IF(feature-b]',
        '///: BEGIN:ONLY_INCLUDE_IF[flask)',
        '///: BEGIN:ONLY_INCLUDE_IF(feature-b.main)',
        '///: BEGIN:ONLY_INCLUDE_IF(feature-b,@)',
        '///: BEGIN:ONLY_INCLUDE_IF(fla k)',

        // Stuff after the directive
        '///: BEGIN:ONLY_INCLUDE_IF(feature-b) A',
        '///: BEGIN:ONLY_INCLUDE_IF(feature-b) 9',
        '///: BEGIN:ONLY_INCLUDE_IF(feature-b)A',
        '///: BEGIN:ONLY_INCLUDE_IF(feature-b)9',
        '///: BEGIN:ONLY_INCLUDE_IF(feature-b)_',
        '///: BEGIN:ONLY_INCLUDE_IF(feature-b))',
      ];

      replacements.forEach((replacement) => {
        expect(() =>
          removeFencedCode(
            mockFileName,
            getFencedCode(FEATURE_B).replace(directiveString, replacement),
            getFeatures({
              active: new Set([FEATURE_B]),
              all: new Set([FEATURE_B]),
            }),
          ),
        ).toThrow(
          new RegExp(
            `${replacement.replace(
              /([()[\]])/gu,
              '\\$1',
            )}":\nFailed to parse fence directive.$`,
            'u',
          ),
        );
      });
    });

    it('rejects malformed END directives', () => {
      // This is the last line of the minimal input template
      const directiveString = '///: END:ONLY_INCLUDE_IF';

      const replacements = [
        // Invalid terminus
        '///: ENx:ONLY_INCLUDE_IF',
        '///: EN3:ONLY_INCLUDE_IF',
        '///: EN_:ONLY_INCLUDE_IF',
        '///: EN :ONLY_INCLUDE_IF',
        '///: EN::ONLY_INCLUDE_IF',

        // Invalid commands
        '///: END:ONLY-INCLUDE_IF',
        '///: END::ONLY_INCLUDE_IN',
        '///: END:ONLY_INCLUDE:IF',
        '///: END:ONL6_INCLUDE_IF',
        '///: END:ONLY_IN@LUDE_IF',
        '///: END:ONLy_INCLUDE_IF',
        '///: END:ONLY INCLUDE_IF',

        // Stuff after the directive
        '///: END:ONLY_INCLUDE_IF A',
        '///: END:ONLY_INCLUDE_IF 9',
        '///: END:ONLY_INCLUDE_IF _',
      ];

      replacements.forEach((replacement) => {
        expect(() =>
          removeFencedCode(
            mockFileName,
            getFencedCode(FEATURE_B).replace(directiveString, replacement),
            getFeatures({
              active: new Set([FEATURE_B]),
              all: new Set([FEATURE_B]),
            }),
          ),
        ).toThrow(
          new RegExp(
            `${replacement}":\nFailed to parse fence directive.$`,
            'u',
          ),
        );
      });
    });

    it('rejects files with uneven number of fence lines', () => {
      const additions = [
        '///: BEGIN:ONLY_INCLUDE_IF(feature-b)',
        '///: END:ONLY_INCLUDE_IF',
      ];

      additions.forEach((addition) => {
        expect(() =>
          removeFencedCode(
            mockFileName,
            getFencedCode(FEATURE_B).concat(addition),
            getFeatures({
              active: new Set([FEATURE_B]),
              all: new Set([FEATURE_B]),
            }),
          ),
        ).toThrow(
          /A valid fence consists of two fence lines, but the file contains an uneven number, "3", of fence lines.$/u,
        );
      });
    });

    it('rejects invalid terminuses', () => {
      const testCases = [
        ['BEGIN', ['KAPLAR', 'FLASK', 'FOO']],
        ['END', ['KAPLAR', 'FOO', 'BAR']],
      ] as const;

      testCases.forEach(([validTerminus, replacements]) => {
        replacements.forEach((replacement) => {
          expect(() =>
            removeFencedCode(
              mockFileName,
              getFencedCode(FEATURE_B).replace(validTerminus, replacement),
              getFeatures({
                active: new Set([FEATURE_B]),
                all: new Set([FEATURE_B]),
              }),
            ),
          ).toThrow(
            new RegExp(
              `Line contains invalid directive terminus "${replacement}".$`,
              'u',
            ),
          );
        });
      });
    });

    it('rejects invalid commands', () => {
      const testCases = [
        [/ONLY_INCLUDE_IF\(/mu, ['ONLY_KEEP_IF(', 'FLASK(', 'FOO(']],
        [/ONLY_INCLUDE_IF$/mu, ['ONLY_KEEP_IF', 'FLASK', 'FOO']],
      ] as const;

      testCases.forEach(([validCommand, replacements]) => {
        replacements.forEach((replacement) => {
          expect(() =>
            removeFencedCode(
              mockFileName,
              getFencedCode(FEATURE_B).replace(validCommand, replacement),
              getFeatures({
                active: new Set([FEATURE_B]),
                all: new Set([FEATURE_B]),
              }),
            ),
          ).toThrow(
            new RegExp(
              `Line contains invalid directive command "${replacement.replace(
                '(',
                '',
              )}".$`,
              'u',
            ),
          );
        });
      });
    });

    it('rejects invalid command parameters', () => {
      const testCases = [
        ['bar', ['bar', 'feature-b,bar', 'feature-b,feature-c,feature-a,bar']],
        ['Foo', ['Foo', 'feature-b,Foo', 'feature-b,feature-c,feature-a,Foo']],
        [
          'b3ta',
          ['b3ta', 'feature-b,b3ta', 'feature-b,feature-c,feature-a,b3ta'],
        ],
        [
          'bEta',
          ['bEta', 'feature-b,bEta', 'feature-b,feature-c,feature-a,bEta'],
        ],
      ] as const;

      testCases.forEach(([invalidParam, replacements]) => {
        replacements.forEach((replacement) => {
          expect(() =>
            removeFencedCode(
              mockFileName,
              getFencedCode(replacement),
              getFeatures({
                active: new Set([FEATURE_B]),
                all: new Set([FEATURE_B, FEATURE_A, FEATURE_C]),
              }),
            ),
          ).toThrow(
            new RegExp(
              `"${invalidParam}" is not a declared build feature.$`,
              'u',
            ),
          );
        });
      });

      // Should fail for empty params
      expect(() =>
        removeFencedCode(
          mockFileName,
          getFencedCode('').replace('()', ''),
          getFeatures({
            active: new Set([FEATURE_B]),
            all: new Set([FEATURE_B]),
          }),
        ),
      ).toThrow(
        'Invalid code fence parameters in file "file.js":\nNo parameters specified.',
      );
    });

    it('rejects directive pairs with wrong terminus order', () => {
      // We need more than one directive pair for this test
      const input = getFencedCode(FEATURE_B).concat(getFencedCode(FEATURE_C));

      const expectedBeginError =
        'The first directive of a pair must be a "BEGIN" directive.';
      const expectedEndError =
        'The second directive of a pair must be an "END" directive.';
      const testCases = [
        [
          'BEGIN:ONLY_INCLUDE_IF(feature-b)',
          'END:ONLY_INCLUDE_IF',
          expectedBeginError,
        ],
        [
          /END:ONLY_INCLUDE_IF/mu,
          'BEGIN:ONLY_INCLUDE_IF(feature-a)',
          expectedEndError,
        ],
        [
          'BEGIN:ONLY_INCLUDE_IF(feature-c)',
          'END:ONLY_INCLUDE_IF',
          expectedBeginError,
        ],
      ] as const;

      testCases.forEach(([target, replacement, expectedError]) => {
        expect(() =>
          removeFencedCode(
            mockFileName,
            input.replace(target, replacement),
            getFeatures({
              active: new Set([FEATURE_B]),
              all: new Set([FEATURE_B]),
            }),
          ),
        ).toThrow(expectedError);
      });
    });

    it('ignores files with inline source maps', () => {
      // This is so that there isn't an unnecessary second execution of
      // removeFencedCode with a transpiled version of the same file
      const input = getFencedCode('foo').concat(
        '\n//# sourceMappingURL=as32e32wcwc2234f2ew32cnin4243f4nv9nsdoivnxzoivnd',
      );
      expect(
        removeFencedCode(
          mockFileName,
          input,
          getFeatures({
            active: new Set([FEATURE_A]),
            all: new Set([FEATURE_A]),
          }),
        ),
      ).toStrictEqual([input, false]);
    });

    // We can't do this until there's more than one command
    it.todo('rejects directive pairs with mismatched commands');
  });

  describe('multiSplice', () => {
    it('throws if the indices array is empty or of odd length', () => {
      [[], [1], [1, 2, 3]].forEach((invalidInput) => {
        expect(() => multiSplice('foobar', invalidInput)).toThrow(
          'Expected non-empty, even-length array.',
        );
      });
    });

    it('throws if the indices array contains non-integer or negative numbers', () => {
      [
        [1.2, 2],
        [3, -1],
      ].forEach((invalidInput) => {
        expect(() => multiSplice('foobar', invalidInput)).toThrow(
          'Expected array of non-negative integers.',
        );
      });
    });
  });

  describe('validateCommand', () => {
    it('throws if the parameters are invalid', () => {
      [null, undefined, []].forEach((invalidInput) => {
        expect(() =>
          validateCommand(
            DirectiveCommand.ONLY_INCLUDE_IF,
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            invalidInput as any,
            'file.js',
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {} as any,
          ),
        ).toThrow('No parameters specified.');
      });
    });

    it('throws if the command is unrecognized', () => {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => validateCommand('foobar', [], 'file.js', {} as any)).toThrow(
        'Unrecognized command "foobar".',
      );
    });
  });
});
