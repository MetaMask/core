import { SignTypedDataVersion } from '@metamask/keyring-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../../logger';
import type {
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import {
  DEPOSIT_WALLET_FACTORY_ADDRESS_POLYGON,
  POLYMARKET_BATCH_DEADLINE_SECONDS,
  PUSD_ADDRESS_POLYGON,
} from './constants';
import type { PolymarketRelayerApi } from './relayer-api';
import type {
  PolymarketBridgeQuote,
  PolymarketBridgeRelayerSubmitRequest,
} from './types';
import { buildWalletBatchTypedData } from './wallet-batch-typed-data';

const log = createModuleLogger(projectLogger, 'polymarket-bridge-withdraw');

const CHAIN_ID_POLYGON = 137;

/**
 * Submit a Polymarket Bridge withdrawal via the relayer.
 *
 * Orchestrates the full flow: fetch nonce → build transfer calldata →
 * construct EIP-712 Batch → sign → POST to relayer → poll until terminal.
 *
 * @param quote - The bridge quote containing fromAmount and bridgeDepositAddress.
 * @param from - The user's EOA address (signer that owns the deposit wallet).
 * @param depositWalletAddress - The DepositWallet contract address on Polygon.
 * @param messenger - Controller messenger for KeyringController:signTypedMessage.
 * @param relayerApi - Authenticated Polymarket relayer API client.
 * @returns The relayer's on-chain transaction hash.
 */
export async function submitPolymarketBridgeWithdraw(
  quote: TransactionPayQuote<PolymarketBridgeQuote>,
  from: Hex,
  depositWalletAddress: Hex,
  bridgeDepositAddress: Hex,
  messenger: TransactionPayControllerMessenger,
  relayerApi: PolymarketRelayerApi,
): Promise<{ relayerTransactionHash: Hex }> {
  const { fromAmount } = quote.original;

  const amount = BigInt(fromAmount);
  const transferCalldata = encodeTransferCalldata(bridgeDepositAddress, amount);

  log('Built transfer calldata', {
    target: PUSD_ADDRESS_POLYGON,
    to: bridgeDepositAddress,
    amount: amount.toString(),
  });

  return await submitDepositWalletBatch({
    from,
    depositWalletAddress,
    calls: [
      {
        target: PUSD_ADDRESS_POLYGON,
        value: 0n,
        data: transferCalldata,
      },
    ],
    messenger,
    relayerApi,
  });
}

/**
 * Submit an arbitrary batch of calls from a Polymarket deposit wallet via the
 * existing relayer proxy. Handles nonce fetch, EIP-712 signing, submission,
 * and polling to terminal state.
 *
 * @param options - Submission options.
 * @param options.from - The owner EOA of the deposit wallet.
 * @param options.depositWalletAddress - The deposit wallet address.
 * @param options.calls - Calls to execute in the batch.
 * @param options.messenger - Controller messenger for signing.
 * @param options.relayerApi - Authenticated relayer API client.
 * @returns The relayer's on-chain transaction hash.
 */
export async function submitDepositWalletBatch({
  from,
  depositWalletAddress,
  calls,
  messenger,
  relayerApi,
}: {
  from: Hex;
  depositWalletAddress: Hex;
  calls: { target: Hex; value: bigint; data: Hex }[];
  messenger: TransactionPayControllerMessenger;
  relayerApi: PolymarketRelayerApi;
}): Promise<{ relayerTransactionHash: Hex }> {
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

  log('Signing Batch via EIP-712', { nonce, deadline, callCount: calls.length });

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
      `Polymarket bridge withdraw failed: relayer state=${terminalStatus.state}, txId=${submitResponse.transactionID}`,
    );
  }

  if (!terminalStatus.transactionHash) {
    throw new Error(
      `Polymarket bridge withdraw: terminal state=${terminalStatus.state} but no transactionHash`,
    );
  }

  log('Withdrawal complete', {
    transactionHash: terminalStatus.transactionHash,
    state: terminalStatus.state,
  });

  return {
    relayerTransactionHash: terminalStatus.transactionHash as Hex,
  };
}

/**
 * Encode an ERC-20 transfer(address,uint256) call.
 *
 * Selector: 0xa9059cbb
 * Layout: 4-byte selector + 32-byte left-padded address + 32-byte uint256
 *
 * @param to - Recipient address.
 * @param amount - Token amount in base units.
 * @returns The hex-encoded calldata.
 */
function encodeTransferCalldata(to: Hex, amount: bigint): Hex {
  const selector = '0xa9059cbb';
  const paddedAddress = to.slice(2).toLowerCase().padStart(64, '0');
  const paddedAmount = amount.toString(16).padStart(64, '0');

  return `0x${selector.slice(2)}${paddedAddress}${paddedAmount}` as Hex;
}
