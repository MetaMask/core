import { handleFetch } from '@metamask/controller-utils';
import { hexToNumber } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { OracleLayer1GasFeeFlow } from './OracleLayer1GasFeeFlow';
import { CHAIN_IDS } from '../constants';
import type { TransactionControllerMessenger } from '../TransactionController';
import type { TransactionMeta } from '../types';

const FALLBACK_OPTIMISM_STACK_CHAIN_IDS: Hex[] = [
  CHAIN_IDS.OPTIMISM,
  CHAIN_IDS.OPTIMISM_TESTNET,
  CHAIN_IDS.BASE,
  CHAIN_IDS.BASE_TESTNET,
  CHAIN_IDS.OPBNB,
  CHAIN_IDS.OPBNB_TESTNET,
  CHAIN_IDS.ZORA,
];

// Default oracle address now provided by base class

type SupportedNetworksResponse = {
  readonly fullSupport: readonly number[];
  readonly partialSupport: {
    readonly optimism: readonly number[];
  };
};

const GAS_SUPPORTED_NETWORKS_ENDPOINT =
  'https://gas.api.cx.metamask.io/v1/supportedNetworks';

/**
 * Optimism layer 1 gas fee flow that obtains gas fee estimate using an oracle contract.
 */
export class OptimismLayer1GasFeeFlow extends OracleLayer1GasFeeFlow {
  async matchesTransaction({
    transactionMeta,
  }: {
    transactionMeta: TransactionMeta;
    messenger: TransactionControllerMessenger;
  }): Promise<boolean> {
    const chainIdAsNumber = hexToNumber(transactionMeta.chainId);

    const supportedChains =
      await OptimismLayer1GasFeeFlow.fetchOptimismSupportedChains();

    if (supportedChains?.has(chainIdAsNumber)) {
      return true;
    }

    return FALLBACK_OPTIMISM_STACK_CHAIN_IDS.includes(transactionMeta.chainId);
  }

  // Uses default oracle address from base class

  /**
   * Fetch remote OP-stack support list; fall back to local list when unavailable.
   *
   * @returns A set of supported OP-stack chain IDs or null on failure.
   */
  private static async fetchOptimismSupportedChains(): Promise<Set<number> | null> {
    try {
      const res: SupportedNetworksResponse = await handleFetch(
        GAS_SUPPORTED_NETWORKS_ENDPOINT,
      );
      const list = res?.partialSupport?.optimism ?? [];
      return new Set<number>(list);
    } catch {
      return null;
    }
  }
}
