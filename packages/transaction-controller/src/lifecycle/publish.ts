import type { TraceContext } from '@metamask/controller-utils';
import type { NetworkClientId } from '@metamask/network-controller';
import { projectLogger as log } from '../logger.js';
import type {
  PublishHook,
  PublishHookResult,
  TransactionMeta,
} from '../types.js';
import type {
  TransactionConstructorOptions,
  TransactionStageDependencies,
} from './types.js';

/** Dependencies required to run the configured publish hook. */
export type PublishTransactionRequest = {
  constructorOptions: Pick<TransactionConstructorOptions, 'trace'> & {
    hooks: Pick<TransactionConstructorOptions['hooks'], 'publish'>;
  };
  dependencies: Pick<TransactionStageDependencies, 'publishTransaction'>;
};

/**
 * Run the publish hook, falling back to the controller's shared publisher.
 *
 * @param request - Publishing dependencies.
 * @param options - Network, hook and trace overrides.
 * @param options.networkClientId - Network captured before signing.
 * @param options.publishHookOverride - Per-transaction publish hook.
 * @param options.traceContext - Parent trace context.
 * @param transactionMeta - The transaction to publish.
 * @param signedTx - The serialized signed transaction.
 * @returns The resulting transaction hash.
 */
export async function defaultPublishHook(
  request: PublishTransactionRequest,
  {
    networkClientId,
    publishHookOverride,
    traceContext,
  }: {
    networkClientId: NetworkClientId;
    publishHookOverride?: PublishHook;
    traceContext?: TraceContext;
  },
  transactionMeta: TransactionMeta,
  signedTx: string,
): Promise<PublishHookResult> {
  const {
    constructorOptions: { hooks, trace },
    dependencies,
  } = request;
  let transactionHash: string | undefined;

  await trace({ name: 'Publish', parentContext: traceContext }, async () => {
    const publishHook: PublishHook =
      publishHookOverride ??
      hooks.publish ??
      (() => Promise.resolve({ transactionHash: undefined }));
    ({ transactionHash } = await publishHook(transactionMeta, signedTx));

    // eslint-disable-next-line require-atomic-updates
    transactionHash ??= await dependencies.publishTransaction({
      ...transactionMeta,
      networkClientId,
      rawTx: signedTx,
    });
  });

  log('Publish successful', transactionHash);
  return { transactionHash };
}
