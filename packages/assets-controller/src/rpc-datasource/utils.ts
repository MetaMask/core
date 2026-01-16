// =============================================================================
// BATCH UTILITIES
// =============================================================================

/**
 * Divides an array into batches of specified size.
 *
 * @param values - Array of values to divide.
 * @param options - Options containing batchSize.
 * @param options.batchSize - The size of each batch.
 * @returns Array of batches.
 */
export function divideIntoBatches<ArrayElement>(
  values: ArrayElement[],
  { batchSize }: { batchSize: number },
): ArrayElement[][] {
  const batches: ArrayElement[][] = [];
  for (let i = 0; i < values.length; i += batchSize) {
    batches.push(values.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Reduces an array in serial batches, applying an async function to each batch.
 *
 * @param options - The options for batch reduction.
 * @param options.values - Array of values to process.
 * @param options.batchSize - Size of each batch.
 * @param options.eachBatch - Async function to apply to each batch.
 * @param options.initialResult - Initial result value.
 * @returns The final reduced result.
 */
export async function reduceInBatchesSerially<Value, Result>({
  values,
  batchSize,
  eachBatch,
  initialResult,
}: {
  values: Value[];
  batchSize: number;
  eachBatch: (
    workingResult: Partial<Result>,
    batch: Value[],
    index: number,
  ) => Partial<Result> | Promise<Partial<Result>>;
  initialResult: Partial<Result>;
}): Promise<Result> {
  const batches = divideIntoBatches(values, { batchSize });
  let workingResult = initialResult;
  for (const [index, batch] of batches.entries()) {
    workingResult = await eachBatch(workingResult, batch, index);
  }
  // There's no way around this — we have to assume that in the end, the result
  // matches the intended type.
  const finalResult = workingResult as Result;
  return finalResult;
}
