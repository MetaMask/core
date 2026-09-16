import { addTransactionToState } from '../lifecycle/add.js';
import { awaitApproval } from '../lifecycle/approval.js';
import { approveTransaction } from '../lifecycle/approve.js';
import { startBackgroundUpdates } from '../lifecycle/background.js';
import { addTransactionData } from '../lifecycle/data.js';
import { handleTransactionError } from '../lifecycle/error.js';
import { finishTransaction } from '../lifecycle/finish.js';
import { initTransaction } from '../lifecycle/init.js';
import { signTransaction } from '../lifecycle/sign.js';
import { cleanupTransaction } from '../lifecycle/state.js';
import { submitTransaction } from '../lifecycle/submit.js';
import type {
  AddTransactionInput,
  TransactionConstructorOptions,
  TransactionStageDependencies,
} from '../lifecycle/types.js';
import { projectLogger as log } from '../logger.js';
import type { Result } from '../TransactionController.js';

/** Input and controller services for adding a transaction. */
export type AddTransactionRequest = {
  addTransactionRequest: AddTransactionInput;
  constructorOptions: TransactionConstructorOptions;
  dependencies: TransactionStageDependencies;
};

/**
 * Add a transaction and start its approval, signing and submission lifecycle.
 *
 * @param input - Transaction parameters, options and controller dependencies.
 * @returns Initial metadata and a separate promise for the submitted hash.
 */
export async function addTransaction(
  input: AddTransactionRequest,
): Promise<Result> {
  const { options, txParams } = input.addTransactionRequest;
  log('Adding transaction', txParams, options);

  const request = await initTransaction(input);
  await addTransactionData(request);
  addTransactionToState(request);
  startBackgroundUpdates(request);

  const result = (async (): Promise<void> => {
    await awaitApproval(request);
    await approveTransaction(request);
    await signTransaction(request);
    await submitTransaction(request);
  })()
    .catch((error: unknown) => handleTransactionError(request, error))
    .finally(() => cleanupTransaction(request))
    .then(() => finishTransaction(request));

  return { result, transactionMeta: request.transactionMeta };
}
