export const toRejectedErrorMessage = <Result>(
  prefix: string,
  results: PromiseSettledResult<Result>[],
) => {
  let errorMessage = `${prefix}:`;
  for (const r of results) {
    if (r.status === 'rejected') {
      errorMessage += `\n- ${r.reason}`;
    }
  }
  return errorMessage;
};
