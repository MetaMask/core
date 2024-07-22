// src/transforms/utils.ts
var TAB = "    ";
async function lintTransformedFile(eslintInstance, filePath, fileContent) {
  const lintResult = (await eslintInstance.lintText(fileContent, { filePath, warnIgnored: false }))[0];
  if (lintResult === void 0) {
    throw new Error(
      `MetaMask build: Transformed file "${filePath}" appears to be ignored by ESLint.`
    );
  }
  if (lintResult.errorCount === 0) {
    return;
  }
  const errorsString = lintResult.messages.filter(({ severity }) => severity === 2).reduce((allErrors, { message, ruleId }) => {
    return allErrors.concat(
      `${TAB}${ruleId ?? "<Unknown rule>"}
${TAB}${message}

`
    );
  }, "");
  throw new Error(
    `MetaMask build: Lint errors encountered for transformed file "${filePath}":

${errorsString}`
  );
}

export {
  lintTransformedFile
};
//# sourceMappingURL=chunk-YMWXOLEF.mjs.map