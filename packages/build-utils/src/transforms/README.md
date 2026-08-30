# Source file transforms

This directory contains home-grown transforms for the build systems of the MetaMask applications.

## Remove Fenced Code

> `./remove-fenced-code.ts`

### Usage

Let's imagine you've added some fences to your source code.

```typescript
this.store.updateStructure({
  /** ..., */
  GasFeeController: this.gasFeeController,
  TokenListController: this.tokenListController,
  ///: BEGIN:ONLY_INCLUDE_IF(snaps)
  SnapController: this.snapController,
  ///: END:ONLY_INCLUDE_IF
});
```

The transform should be applied on your raw source files as they are committed to
your repository, before anything else (e.g. Babel, `tsc`, etc.) parses or modifies them.

```typescript
import {
  FeatureLabels,
  removeFencedCode,
  lintTransformedFile,
} from '@metamask/build-utils';

// Let's imagine this function exists in your build system and is called immediately
// after your source files are read from disk.
async function applyTransforms(
  filePath: string,
  fileContent: string,
  features: FeatureLabels,
  shouldLintTransformedFiles: boolean = true,
): string {
  const [newFileContent, wasModified] = removeFencedCode(
    filePath,
    fileContent,
    features,
  );

  // You may choose to disable linting during e.g. dev builds since lint failures cause
  // an error to be thrown.
  if (wasModified && shouldLintTransformedFiles) {
    // You probably only need a singleton ESLint instance for your linting purposes.
    // See the lintTransformedFile documentation for important notes about usage.
    const eslintInstance = getESLintInstance();
    await lintTransformedFile(eslintInstance, filePath, newFileContent);
  }
  return newFileContent;
}

// Then, in the relevant part of your build process...

const features: FeatureLabels = {
  active: new Set(['foo']), // Fences with these features will be included.
  all: new Set(['snaps', 'foo' /** etc. */]), // All extant features must be listed here.
};

const transformedFile = await applyTransforms(
  filePath,
  fileContent,
  features,
  shouldLintTransformedFiles,
);

// Do something with the results.
// continueBuildProcess(transformedFile);
```

After the transform has been applied as above, the example source code will look like this:

```typescript
this.store.updateStructure({
  /** ..., */
  GasFeeController: this.gasFeeController,
  TokenListController: this.tokenListController,
});
```

### Overview

When creating builds that support different features, it is desirable to exclude
unsupported features, files, and dependencies at build time. Undesired files and
dependencies can be excluded wholesale, but the _use_ of undesired modules in
files that should otherwise be included – i.e. import statements and references
to those imports – cannot.

To support the exclusion of the use of undesired modules at build time, we
introduce the concept of code fencing to our build system. Our code fencing
syntax amounts to a tiny DSL, which is specified below.

The transform expects to receive the contents of individual files as a single string,
which it will parse in order to identify any code fences. If any fences that should not
be included in the current build are found, the fences and the lines that they wrap
are deleted. An error is thrown if a malformed fence is identified.

For example, the following fenced code:

```javascript
this.store.updateStructure({
  ...,
  GasFeeController: this.gasFeeController,
  TokenListController: this.tokenListController,
  ///: BEGIN:ONLY_INCLUDE_IF(snaps)
  SnapController: this.snapController,
  ///: END:ONLY_INCLUDE_IF
});
```

Is transformed as follows if the current build should not include the `snaps` feature:

```javascript
this.store.updateStructure({
  ...,
  GasFeeController: this.gasFeeController,
  TokenListController: this.tokenListController,
});
```

Note that multiple features can be specified by separating them with
commands inside the parameter parentheses:

```javascript
///: BEGIN:ONLY_INCLUDE_IF(build-beta,build-flask)
```

### Code Fencing Syntax

> In the specification, angle brackets, `< >`, indicate required tokens, while
> straight brackets, `[ ]`, indicate optional tokens.
>
> Alphabetical characters identify the name and purpose of a token. All other
> characters, including parentheses, `( )`, are literals.

A fence line is a single-line JavaScript comment, optionally surrounded by
whitespace, in the following format:

```text
///: <terminus>:<command>[(parameters)]

|__| |________________________________|
  |                  |
  |                  |
sentinel         directive
```

The first part of a fence line is the **sentinel** which is always the string
"`///:`". If the first four non-whitespace characters of a line are not exactly the
**sentinel** the line will be ignored by the parser. The **sentinel** must be
succeeded by a single space character, or parsing will fail.

The remainder of the fence line is called the **directive**
The directive consists of a **terminus** **command** and **parameters**

- The **terminus** is one of the strings `BEGIN` and `END`. It must be followed by
  a single colon, `:`.
- The **command** is a string of uppercase alphabetical characters, optionally
  including underscores, `_`. The possible commands are listed later in this
  specification.
- The **parameters** are a string of comma-separated RegEx `\w` strings. The parameters
  string must be parenthesized, only specified for `BEGIN` directives, and valid for its
  command.

A valid code fence consists of two fence lines surrounding one or more lines of
non-fence lines. The first fence line must consist of a `BEGIN` directive, and
the second an `END` directive. The command of both directives must be the same,
and the parameters (if any) must be valid for the command. Nesting is not intended
to be supported, and may produce undefined behavior.

If an invalid fence is detected, parsing will fail, and the transform will throw
an error.

### Commands

#### `ONLY_INCLUDE_IF`

This, the only command defined so far, is used to exclude lines of code depending
on flags provided to the current build process. If a particular set of lines should
only be included in e.g. the beta build type, they should be wrapped as follows:

```javascript
///: BEGIN:ONLY_INCLUDE_IF(build-beta)
console.log('I am only included in beta builds.');
///: END:ONLY_INCLUDE_IF
```

At build time, the fences and the fenced lines will be removed if the `build-beta`
flag is not provided to the transform.

The parameters must be provided as a comma-separated list of features that are
valid per the consumer's build system.
