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
export declare enum DirectiveCommand {
    ONLY_INCLUDE_IF = "ONLY_INCLUDE_IF"
}
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
export declare function removeFencedCode(filePath: string, fileContent: string, featureLabels: FeatureLabels): [string, boolean];
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
export declare function multiSplice(toSplice: string, splicingIndices: number[]): string;
/**
 * Validates the specified command. Throws if validation fails.
 *
 * @param command - The command to validate.
 * @param params - The parameters of the command.
 * @param filePath - The path of the current file.
 * @param featureLabels - The possible feature labels.
 */
export declare function validateCommand(command: unknown, params: string[], filePath: string, featureLabels: FeatureLabels): asserts command is DirectiveCommand;
//# sourceMappingURL=remove-fenced-code.d.ts.map