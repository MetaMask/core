import { hasProperty } from '@metamask/utils';

/**
 * Two sets of feature labels, where:
 * - `active` is the set of labels that are active for the current build.
 * - `all` is the set of all labels that are declared in the codebase.
 *
 * For `ONLY_INCLUDE_IF` fences, the code fence removal transform will
 * include the fenced code if any of the specified labels are active. See
 * {@link removeFencedCode} for details.
 */
export type FeatureLabels = {
  active: ReadonlySet<string>;
  all: ReadonlySet<string>;
};

enum DirectiveTerminus {
  BEGIN = 'BEGIN',
  END = 'END',
}

export enum DirectiveCommand {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  ONLY_INCLUDE_IF = 'ONLY_INCLUDE_IF',
}

// Matches lines starting with "///:", and any preceding whitespace, except
// newlines. We except newlines to avoid eating blank lines preceding a fenced
// line.
// Double-negative RegEx credit: https://stackoverflow.com/a/3469155
const linesWithFenceRegex = /^[^\S\r\n]*\/\/\/:.*$/gmu;

// Matches the first "///:" in a string, and any preceding whitespace
const fenceSentinelRegex = /^\s*\/\/\/:/u;

// Breaks a fence directive into its constituent components.
// At this stage of parsing, we are looking for one of:
// - TERMINUS:COMMAND(PARAMS)
// - TERMINUS:COMMAND
const directiveParsingRegex =
  /^([A-Z]+):([A-Z_]+)(?:\(((?:\w[-\w]*,)*\w[-\w]*)\))?$/u;

/**
 * Removes fenced code from the given JavaScript source string. "Fenced code"
 * includes the entire fence lines, including their trailing newlines, and the
 * lines that they surround.
 *
 * A valid fence consists of two well-formed fence lines, separated by one or
 * more lines that should be excluded. The first line must contain a `BEGIN`
 * directive, and the second most contain an `END` directive. Both directives
 * must specify the same command.
 *
 * Here's an example of a valid fence:
 *
 * ```javascript
 *   ///: BEGIN:ONLY_INCLUDE_IF(build-flask)
 *   console.log('I am Flask.');
 *   ///: END:ONLY_INCLUDE_IF
 * ```
 *
 * For details, please see the documentation.
 *
 * @param filePath - The path to the file being transformed.
 * @param fileContent - The contents of the file being transformed.
 * @param featureLabels - FeatureLabels that are currently active.
 * @returns A tuple of the post-transform file contents and a boolean indicating
 * whether they were modified.
 */
export function removeFencedCode(
  filePath: string,
  fileContent: string,
  featureLabels: FeatureLabels,
): [string, boolean] {
  // Do not modify the file if we detect an inline sourcemap. For reasons
  // yet to be determined, the transform receives every file twice while in
  // watch mode, the second after Babel has transpiled the file. Babel adds
  // inline source maps to the file, something we will never do in our own
  // source files, so we use the existence of inline source maps to determine
  // whether we should ignore the file.
  if (/^\/\/# sourceMappingURL=/gmu.test(fileContent)) {
    return [fileContent, false];
  }

  // If we didn't match any lines, return the unmodified file contents.
  const matchedLines = [...fileContent.matchAll(linesWithFenceRegex)];

  if (matchedLines.length === 0) {
    return [fileContent, false];
  }

  // Parse fence lines
  const parsedDirectives = matchedLines.map((matchArray) => {
    const line = matchArray[0];

    /* istanbul ignore next: should be impossible */
    if (
      matchArray.index === undefined ||
      !line ||
      !fenceSentinelRegex.test(line)
    ) {
      throw new Error(
        getInvalidFenceLineMessage(
          filePath,
          line ?? '',
          `Fence sentinel may only appear at the start of a line, optionally preceded by whitespace.`,
        ),
      );
    }

    // Store the start and end indices of each line
    // Increment the end index by 1 to including the trailing newline when
    // performing string operations.
    const indices: [number, number] = [
      matchArray.index,
      matchArray.index + line.length + 1,
    ];

    const lineWithoutSentinel = line.replace(fenceSentinelRegex, '');
    if (!/^ \w\w+/u.test(lineWithoutSentinel)) {
      throw new Error(
        getInvalidFenceLineMessage(
          filePath,
          line,
          `Fence sentinel must be followed by a single space and an alphabetical string of two or more characters.`,
        ),
      );
    }

    const directiveMatches = lineWithoutSentinel
      .trim()
      .match(directiveParsingRegex);

    if (!directiveMatches) {
      throw new Error(
        getInvalidFenceLineMessage(
          filePath,
          line,
          `Failed to parse fence directive.`,
        ),
      );
    }

    // The first element of a RegEx match array is the input.
    // Typecast: If there's a match, the expected elements must exist.
    const [, terminus, command, parameters] = directiveMatches as [
      string,
      string,
      string,
      string,
    ];

    if (!isValidTerminus(terminus)) {
      throw new Error(
        getInvalidFenceLineMessage(
          filePath,
          line,
          `Line contains invalid directive terminus "${terminus}".`,
        ),
      );
    }

    if (!isValidCommand(command)) {
      throw new Error(
        getInvalidFenceLineMessage(
          filePath,
          line,
          `Line contains invalid directive command "${command}".`,
        ),
      );
    }

    if (terminus === DirectiveTerminus.BEGIN) {
      if (!parameters) {
        throw new Error(
          getInvalidParamsMessage(filePath, `No parameters specified.`),
        );
      }

      return {
        command,
        indices,
        line,
        parameters: parameters.split(','),
        terminus,
      };
    }
    return { command, indices, line, terminus };
  });

  if (parsedDirectives.length % 2 !== 0) {
    throw new Error(
      getInvalidFenceStructureMessage(
        filePath,
        `A valid fence consists of two fence lines, but the file contains an uneven number, "${parsedDirectives.length}", of fence lines.`,
      ),
    );
  }

  // The below for-loop iterates over the parsed fence directives and performs
  // the following work:
  // - Ensures that the array of parsed directives consists of valid directive
  //   pairs, as specified in the documentation.
  // - For each directive pair, determines whether their fenced lines should be
  //   removed for the current build, and if so, stores the indices we will use
  //   to splice the file content string.

  const splicingIndices: number[] = [];
  let shouldSplice = false;
  let currentCommand: string;

  parsedDirectives.forEach((directive, i) => {
    const { line, indices, terminus, command } = directive;

    if (i % 2 === 0) {
      if (terminus !== DirectiveTerminus.BEGIN) {
        throw new Error(
          getInvalidFencePairMessage(
            filePath,
            line,
            `The first directive of a pair must be a "BEGIN" directive.`,
          ),
        );
      }

      const { parameters } = directive;
      currentCommand = command;
      validateCommand(command, parameters, filePath, featureLabels);

      const blockIsActive = parameters.some((param) =>
        featureLabels.active.has(param),
      );

      if (blockIsActive) {
        shouldSplice = false;
      } else {
        shouldSplice = true;

        // Add start index of BEGIN directive line to splicing indices
        splicingIndices.push(indices[0]);
      }
    } else {
      if (terminus !== DirectiveTerminus.END) {
        throw new Error(
          getInvalidFencePairMessage(
            filePath,
            line,
            `The second directive of a pair must be an "END" directive.`,
          ),
        );
      }

      /* istanbul ignore next: impossible until there's more than one command */
      if (command !== currentCommand) {
        throw new Error(
          getInvalidFencePairMessage(
            filePath,
            line,
            `Expected "END" directive to have command "${currentCommand}" but found "${command}".`,
          ),
        );
      }

      // Forbid empty fences
      const { line: previousLine, indices: previousIndices } =
        // We're only in this case if i > 0, so this will always be defined.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        parsedDirectives[i - 1]!;
      if (fileContent.substring(previousIndices[1], indices[0]).trim() === '') {
        throw new Error(
          `Empty fence found in file "${filePath}":\n${previousLine}\n${line}\n`,
        );
      }

      if (shouldSplice) {
        // Add end index of END directive line to splicing indices
        splicingIndices.push(indices[1]);
      }
    }
  });

  // This indicates that the present build type should include all fenced code,
  // and so we just returned the unmodified file contents.
  if (splicingIndices.length === 0) {
    return [fileContent, false];
  }

  /* istanbul ignore next: should be impossible */
  if (splicingIndices.length % 2 !== 0) {
    throw new Error(
      `Internal error while transforming file "${filePath}":\nCollected an uneven number of splicing indices: "${splicingIndices.length}"`,
    );
  }

  return [multiSplice(fileContent, splicingIndices), true];
}

/**
 * Returns a copy of the given string, without the character ranges specified
 * by the splicing indices array.
 *
 * The splicing indices must be a non-empty, even-length array of non-negative
 * integers, specifying the character ranges to remove from the given string, as
 * follows:
 *
 * `[ start, end, start, end, start, end, ... ]`
 *
 * Throws if the array is not an even-length array of non-negative integers.
 *
 * @param toSplice - The string to splice.
 * @param splicingIndices - Indices to splice at.
 * @returns The spliced string.
 */
export function multiSplice(
  toSplice: string,
  splicingIndices: number[],
): string {
  if (splicingIndices.length === 0 || splicingIndices.length % 2 !== 0) {
    throw new Error('Expected non-empty, even-length array.');
  }
  if (splicingIndices.some((index) => !Number.isInteger(index) || index < 0)) {
    throw new Error('Expected array of non-negative integers.');
  }

  const retainedSubstrings = [];

  // Get the first part to be included
  // The substring() call returns an empty string if splicingIndices[0] is 0,
  // which is exactly what we want in that case.
  retainedSubstrings.push(toSplice.substring(0, splicingIndices[0]));

  // This loop gets us all parts of the string that should be retained, except
  // the first and the last.
  // It iterates over all "end" indices of the array except the last one, and
  // pushes the substring between each "end" index and the next "begin" index
  // to the array of retained substrings.
  if (splicingIndices.length > 2) {
    // Note the boundary index of "splicingIndices.length - 1". This loop must
    // not iterate over the last element of the array, which is handled outside
    // of this loop.
    for (let i = 1; i < splicingIndices.length - 1; i += 2) {
      retainedSubstrings.push(
        // splicingIndices[i] refers to an element between the first and last
        // elements of the array, and will always be defined.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        toSplice.substring(splicingIndices[i]!, splicingIndices[i + 1]),
      );
    }
  }

  // Get the last part to be included
  retainedSubstrings.push(
    // The last element of a non-empty array will always be defined.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    toSplice.substring(splicingIndices[splicingIndices.length - 1]!),
  );
  return retainedSubstrings.join('');
}

/**
 * Gets an invalid fence line error message.
 *
 * @param filePath - The path to the file that caused the error.
 * @param line - The contents of the line with the error.
 * @param details - An explanation of the error.
 * @returns The error message.
 */
function getInvalidFenceLineMessage(
  filePath: string,
  line: string,
  details: string,
) {
  return `Invalid fence line in file "${filePath}": "${line}":\n${details}`;
}

/**
 * Gets an invalid fence structure error message.
 *
 * @param filePath - The path to the file that caused the error.
 * @param details - An explanation of the error.
 * @returns The error message.
 */
function getInvalidFenceStructureMessage(filePath: string, details: string) {
  return `Invalid fence structure in file "${filePath}":\n${details}`;
}

/**
 * Gets an invalid fence pair error message.
 *
 * @param filePath - The path to the file that caused the error.
 * @param line - The contents of the line with the error.
 * @param details - An explanation of the error.
 * @returns The error message.
 */
function getInvalidFencePairMessage(
  filePath: string,
  line: string,
  details: string,
) {
  return `Invalid fence pair in file "${filePath}" due to line "${line}":\n${details}`;
}

/**
 * Gets an invalid command params error message.
 *
 * @param filePath - The path to the file that caused the error.
 * @param details - An explanation of the error.
 * @param command - The command of the directive with the invalid parameters, if known.
 * @returns The error message.
 */
function getInvalidParamsMessage(
  filePath: string,
  details: string,
  command?: string,
) {
  return `Invalid code fence parameters in file "${filePath}"${
    command ? `for command "${command}"` : ''
  }:\n${details}`;
}

/**
 * Checks whether the given terminus string is valid, i.e. one of `BEGIN` or `END`.
 *
 * @param terminus - The terminus string to validate.
 * @returns Whether the string is a valid terminus string.
 */
function isValidTerminus(terminus: string): terminus is DirectiveTerminus {
  return hasProperty(DirectiveTerminus, terminus);
}

/**
 * Checks whether the given command string is valid.
 *
 * @param command - The command string to validate.
 * @returns Whether the string is a valid command string.
 */
function isValidCommand(command: string): command is DirectiveCommand {
  return hasProperty(DirectiveCommand, command);
}

/**
 * Validates the specified command. Throws if validation fails.
 *
 * @param command - The command to validate.
 * @param params - The parameters of the command.
 * @param filePath - The path of the current file.
 * @param featureLabels - The possible feature labels.
 */
export function validateCommand(
  command: unknown,
  params: string[],
  filePath: string,
  featureLabels: FeatureLabels,
): asserts command is DirectiveCommand {
  switch (command) {
    case DirectiveCommand.ONLY_INCLUDE_IF:
      if (!params || params.length === 0) {
        throw new Error(
          getInvalidParamsMessage(
            filePath,
            `No parameters specified.`,
            DirectiveCommand.ONLY_INCLUDE_IF,
          ),
        );
      }

      for (const param of params) {
        if (!featureLabels.all.has(param)) {
          throw new Error(
            getInvalidParamsMessage(
              filePath,
              `"${param}" is not a declared build feature.`,
              DirectiveCommand.ONLY_INCLUDE_IF,
            ),
          );
        }
      }
      break;

    default:
      throw new Error(`Unrecognized command "${String(command)}".`);
  }
}
