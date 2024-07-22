"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/transforms/remove-fenced-code.ts
var _utils = require('@metamask/utils');
var DirectiveTerminus = /* @__PURE__ */ ((DirectiveTerminus2) => {
  DirectiveTerminus2["BEGIN"] = "BEGIN";
  DirectiveTerminus2["END"] = "END";
  return DirectiveTerminus2;
})(DirectiveTerminus || {});
var DirectiveCommand = /* @__PURE__ */ ((DirectiveCommand2) => {
  DirectiveCommand2["ONLY_INCLUDE_IF"] = "ONLY_INCLUDE_IF";
  return DirectiveCommand2;
})(DirectiveCommand || {});
var linesWithFenceRegex = /^[^\S\r\n]*\/\/\/:.*$/gmu;
var fenceSentinelRegex = /^\s*\/\/\/:/u;
var directiveParsingRegex = /^([A-Z]+):([A-Z_]+)(?:\(((?:\w[-\w]*,)*\w[-\w]*)\))?$/u;
function removeFencedCode(filePath, fileContent, featureLabels) {
  if (/^\/\/# sourceMappingURL=/gmu.test(fileContent)) {
    return [fileContent, false];
  }
  const matchedLines = [...fileContent.matchAll(linesWithFenceRegex)];
  if (matchedLines.length === 0) {
    return [fileContent, false];
  }
  const parsedDirectives = matchedLines.map((matchArray) => {
    const line = matchArray[0];
    if (matchArray.index === void 0 || !line || !fenceSentinelRegex.test(line)) {
      throw new Error(
        getInvalidFenceLineMessage(
          filePath,
          line ?? "",
          `Fence sentinel may only appear at the start of a line, optionally preceded by whitespace.`
        )
      );
    }
    const indices = [
      matchArray.index,
      matchArray.index + line.length + 1
    ];
    const lineWithoutSentinel = line.replace(fenceSentinelRegex, "");
    if (!/^ \w\w+/u.test(lineWithoutSentinel)) {
      throw new Error(
        getInvalidFenceLineMessage(
          filePath,
          line,
          `Fence sentinel must be followed by a single space and an alphabetical string of two or more characters.`
        )
      );
    }
    const directiveMatches = lineWithoutSentinel.trim().match(directiveParsingRegex);
    if (!directiveMatches) {
      throw new Error(
        getInvalidFenceLineMessage(
          filePath,
          line,
          `Failed to parse fence directive.`
        )
      );
    }
    const [, terminus, command, parameters] = directiveMatches;
    if (!isValidTerminus(terminus)) {
      throw new Error(
        getInvalidFenceLineMessage(
          filePath,
          line,
          `Line contains invalid directive terminus "${terminus}".`
        )
      );
    }
    if (!isValidCommand(command)) {
      throw new Error(
        getInvalidFenceLineMessage(
          filePath,
          line,
          `Line contains invalid directive command "${command}".`
        )
      );
    }
    if (terminus === "BEGIN" /* BEGIN */) {
      if (!parameters) {
        throw new Error(
          getInvalidParamsMessage(filePath, `No parameters specified.`)
        );
      }
      return {
        command,
        indices,
        line,
        parameters: parameters.split(","),
        terminus
      };
    }
    return { command, indices, line, terminus };
  });
  if (parsedDirectives.length % 2 !== 0) {
    throw new Error(
      getInvalidFenceStructureMessage(
        filePath,
        `A valid fence consists of two fence lines, but the file contains an uneven number, "${parsedDirectives.length}", of fence lines.`
      )
    );
  }
  const splicingIndices = [];
  let shouldSplice = false;
  let currentCommand;
  parsedDirectives.forEach((directive, i) => {
    const { line, indices, terminus, command } = directive;
    if (i % 2 === 0) {
      if (terminus !== "BEGIN" /* BEGIN */) {
        throw new Error(
          getInvalidFencePairMessage(
            filePath,
            line,
            `The first directive of a pair must be a "BEGIN" directive.`
          )
        );
      }
      const { parameters } = directive;
      currentCommand = command;
      validateCommand(command, parameters, filePath, featureLabels);
      const blockIsActive = parameters.some(
        (param) => featureLabels.active.has(param)
      );
      if (blockIsActive) {
        shouldSplice = false;
      } else {
        shouldSplice = true;
        splicingIndices.push(indices[0]);
      }
    } else {
      if (terminus !== "END" /* END */) {
        throw new Error(
          getInvalidFencePairMessage(
            filePath,
            line,
            `The second directive of a pair must be an "END" directive.`
          )
        );
      }
      if (command !== currentCommand) {
        throw new Error(
          getInvalidFencePairMessage(
            filePath,
            line,
            `Expected "END" directive to have command "${currentCommand}" but found "${command}".`
          )
        );
      }
      const { line: previousLine, indices: previousIndices } = (
        // We're only in this case if i > 0, so this will always be defined.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        parsedDirectives[i - 1]
      );
      if (fileContent.substring(previousIndices[1], indices[0]).trim() === "") {
        throw new Error(
          `Empty fence found in file "${filePath}":
${previousLine}
${line}
`
        );
      }
      if (shouldSplice) {
        splicingIndices.push(indices[1]);
      }
    }
  });
  if (splicingIndices.length === 0) {
    return [fileContent, false];
  }
  if (splicingIndices.length % 2 !== 0) {
    throw new Error(
      `Internal error while transforming file "${filePath}":
Collected an uneven number of splicing indices: "${splicingIndices.length}"`
    );
  }
  return [multiSplice(fileContent, splicingIndices), true];
}
function multiSplice(toSplice, splicingIndices) {
  if (splicingIndices.length === 0 || splicingIndices.length % 2 !== 0) {
    throw new Error("Expected non-empty, even-length array.");
  }
  if (splicingIndices.some((index) => !Number.isInteger(index) || index < 0)) {
    throw new Error("Expected array of non-negative integers.");
  }
  const retainedSubstrings = [];
  retainedSubstrings.push(toSplice.substring(0, splicingIndices[0]));
  if (splicingIndices.length > 2) {
    for (let i = 1; i < splicingIndices.length - 1; i += 2) {
      retainedSubstrings.push(
        // splicingIndices[i] refers to an element between the first and last
        // elements of the array, and will always be defined.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        toSplice.substring(splicingIndices[i], splicingIndices[i + 1])
      );
    }
  }
  retainedSubstrings.push(
    // The last element of a non-empty array will always be defined.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    toSplice.substring(splicingIndices[splicingIndices.length - 1])
  );
  return retainedSubstrings.join("");
}
function getInvalidFenceLineMessage(filePath, line, details) {
  return `Invalid fence line in file "${filePath}": "${line}":
${details}`;
}
function getInvalidFenceStructureMessage(filePath, details) {
  return `Invalid fence structure in file "${filePath}":
${details}`;
}
function getInvalidFencePairMessage(filePath, line, details) {
  return `Invalid fence pair in file "${filePath}" due to line "${line}":
${details}`;
}
function getInvalidParamsMessage(filePath, details, command) {
  return `Invalid code fence parameters in file "${filePath}"${command ? `for command "${command}"` : ""}:
${details}`;
}
function isValidTerminus(terminus) {
  return _utils.hasProperty.call(void 0, DirectiveTerminus, terminus);
}
function isValidCommand(command) {
  return _utils.hasProperty.call(void 0, DirectiveCommand, command);
}
function validateCommand(command, params, filePath, featureLabels) {
  switch (command) {
    case "ONLY_INCLUDE_IF" /* ONLY_INCLUDE_IF */:
      if (!params || params.length === 0) {
        throw new Error(
          getInvalidParamsMessage(
            filePath,
            `No parameters specified.`,
            "ONLY_INCLUDE_IF" /* ONLY_INCLUDE_IF */
          )
        );
      }
      for (const param of params) {
        if (!featureLabels.all.has(param)) {
          throw new Error(
            getInvalidParamsMessage(
              filePath,
              `"${param}" is not a declared build feature.`,
              "ONLY_INCLUDE_IF" /* ONLY_INCLUDE_IF */
            )
          );
        }
      }
      break;
    default:
      throw new Error(`Unrecognized command "${String(command)}".`);
  }
}






exports.DirectiveCommand = DirectiveCommand; exports.removeFencedCode = removeFencedCode; exports.multiSplice = multiSplice; exports.validateCommand = validateCommand;
//# sourceMappingURL=chunk-ZCF72S23.js.map