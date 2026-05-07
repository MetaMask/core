import { SignTypedDataVersion } from '@metamask/keyring-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../../logger';
import type {
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import {
  buildWalletBatchTypedData,
  computeDepositWalletAddress,
  DEPOSIT_WALLET_FACTORY_ADDRESS_POLYGON,
  POLYMARKET_BATCH_DEADLINE_SECONDS,
  PolymarketRelayerApi,
} from '../polymarket-bridge';
import type {
  PolymarketBridgeRelayerSubmitRequest,
  RelayerCredentials,
} from '../polymarket-bridge';
import type { PolymarketBridgeStrategyOptions } from '../polymarket-bridge/types';
import { getPolymarketBridgeOptions } from '../../utils/strategy';
import type { RelayQuote, RelayTransactionStep } from './types';

const log = createModuleLogger(projectLogger, 'relay-polymarket-submit');

const CHAIN_ID_POLYGON = 137;

export async function submitViaPolymarketRelayer(
  quote: TransactionPayQuote<RelayQuote>,
  from: Hex,
  messenger: TransactionPayControllerMessenger,
  onSourceHash?: (hash: Hex) => void,
): Promise<void> {
  const options = getPolymarketBridgeOptions();

  if (!options) {
    throw new Error(
      'Polymarket bridge options not configured for Polymarket relayer submission',
    );
  }

  const calls = extractDepositCalls(quote.original);

  log('Extracted deposit calls', { count: calls.length });

  const depositWalletAddress = computeDepositWalletAddress(from);

  const relayerApi = new PolymarketRelayerApi(
    options.environment,
    buildCredentials(options),
  );

  log('Fetching wallet nonce', { from });
  const nonce = await relayerApi.getNonce(from, 'WALLET');

  const deadline =
    Math.floor(Date.now() / 1000) + POLYMARKET_BATCH_DEADLINE_SECONDS;

  const typedData = buildWalletBatchTypedData({
    wallet: depositWalletAddress,
    nonce,
    deadline,
    calls,
    chainId: CHAIN_ID_POLYGON,
  });

  log('Signing Batch via EIP-712', { nonce, deadline });

  const signature = await messenger.call(
    'KeyringController:signTypedMessage',
    {
      from,
      data: JSON.stringify(typedData),
    },
    SignTypedDataVersion.V4,
  );

  const submitRequest: PolymarketBridgeRelayerSubmitRequest = {
    type: 'WALLET',
    from,
    to: DEPOSIT_WALLET_FACTORY_ADDRESS_POLYGON,
    nonce,
    signature: signature as Hex,
    depositWalletParams: {
      depositWallet: depositWalletAddress,
      deadline: deadline.toString(),
      calls: calls.map((call) => ({
        target: call.target,
        value: call.value.toString(),
        data: call.data,
      })),
    },
  };

  log('Submitting to relayer');
  const submitResponse = await relayerApi.submit(submitRequest);

  log('Relayer accepted', {
    transactionID: submitResponse.transactionID,
    state: submitResponse.state,
  });

  const terminalStatus = await relayerApi.pollUntilTerminal(
    submitResponse.transactionID,
  );

  if (
    terminalStatus.state === 'STATE_FAILED' ||
    terminalStatus.state === 'STATE_INVALID'
  ) {
    throw new Error(
      `Polymarket relayer submission failed: state=${terminalStatus.state}, txId=${submitResponse.transactionID}`,
    );
  }

  if (terminalStatus.transactionHash) {
    log('Polymarket relayer reached terminal state', {
      transactionHash: terminalStatus.transactionHash,
      state: terminalStatus.state,
    });

    onSourceHash?.(terminalStatus.transactionHash as Hex);
  }
}

function extractDepositCalls(
  quote: RelayQuote,
): { target: Hex; value: bigint; data: Hex }[] {
  const invalidStep = quote.steps.find((step) => step.kind !== 'transaction');

  if (invalidStep) {
    throw new Error(
      `Polymarket relayer submission only supports transaction-kind steps; got: ${quote.steps.map((step) => `${step.id}(${step.kind})`).join(', ')}`,
    );
  }

  const transactionSteps = quote.steps.filter(
    (step): step is RelayTransactionStep => step.kind === 'transaction',
  );

  return transactionSteps.flatMap((step) =>
    step.items.map((item) => {
      if (item.data.chainId !== CHAIN_ID_POLYGON) {
        throw new Error(
          `Polymarket relayer submission only supports Polygon (137) calls; got chainId=${item.data.chainId}`,
        );
      }

      return {
        target: item.data.to,
        value: BigInt(item.data.value ?? '0'),
        data: item.data.data,
      };
    }),
  );
}

function buildCredentials(
  options: PolymarketBridgeStrategyOptions,
): RelayerCredentials {
  if (options.authType === 'relayer-api-key') {
    return {
      type: 'relayer-api-key',
      apiKey: options.relayerApiKey,
    };
  }

  return {
    type: 'builder',
    apiKey: options.builderApiKey,
    secret: options.builderSecret,
    passphrase: options.builderPassphrase ?? '',
  };
}
