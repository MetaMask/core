import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { CHAIN_ID_POLYGON } from '../../../constants';
import { projectLogger } from '../../../logger';
import type {
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../../types';
import { getLiveTokenBalance } from '../../../utils/token';
import type {
  RelayQuote,
  RelayQuoteRequest,
  RelayTransactionStep,
} from '../types';
import {
  encodeApprove,
  encodeUnwrap,
  encodeWrap,
  extractErc20TransferRecipient,
} from './calldata';
import {
  POLYMARKET_COLLATERAL_OFFRAMP_POLYGON,
  POLYMARKET_COLLATERAL_ONRAMP_POLYGON,
  PUSD_ADDRESS_POLYGON,
  USDC_E_ADDRESS_POLYGON,
} from './constants';
import { computeDepositWalletAddress } from './deposit-wallet';
import { submitDepositWalletBatch } from './relayer';

const log = createModuleLogger(projectLogger, 'polymarket-withdraw');

export function applyPolymarketDepositWalletOverrides(
  body: RelayQuoteRequest,
  request: QuoteRequest,
): void {
  const depositWalletAddress = computeDepositWalletAddress(request.from);

  body.originCurrency = USDC_E_ADDRESS_POLYGON;
  body.user = depositWalletAddress;
  body.refundTo = depositWalletAddress;
  body.useDepositAddress = true;
}

export async function submitPolymarketWithdraw(
  quote: TransactionPayQuote<RelayQuote>,
  from: Hex,
  messenger: TransactionPayControllerMessenger,
): Promise<{ sourceHash: Hex }> {
  const depositWalletAddress = computeDepositWalletAddress(from);
  const relayDepositAddress = extractRelayDepositAddress(quote.original);
  const amount = BigInt(quote.sourceAmount.raw);

  log('Submitting unwrap batch to Relay deposit address', {
    depositWalletAddress,
    relayDepositAddress,
    amount: amount.toString(),
  });

  const { transactionHash } = await submitDepositWalletBatch(messenger, {
    from,
    depositWalletAddress,
    calls: [
      {
        target: PUSD_ADDRESS_POLYGON,
        value: 0n,
        data: encodeApprove(POLYMARKET_COLLATERAL_OFFRAMP_POLYGON, amount),
      },
      {
        target: POLYMARKET_COLLATERAL_OFFRAMP_POLYGON,
        value: 0n,
        data: encodeUnwrap({
          asset: USDC_E_ADDRESS_POLYGON,
          recipient: relayDepositAddress,
          amount,
        }),
      },
    ],
  });

  return { sourceHash: transactionHash };
}

export async function sweepPolymarketDepositWallet(
  from: Hex,
  messenger: TransactionPayControllerMessenger,
): Promise<void> {
  const depositWalletAddress = computeDepositWalletAddress(from);

  let usdceBalance: bigint;
  try {
    const raw = await getLiveTokenBalance(
      messenger,
      depositWalletAddress,
      CHAIN_ID_POLYGON,
      USDC_E_ADDRESS_POLYGON,
    );
    usdceBalance = BigInt(raw);
  } catch (error) {
    log('USDC.e sweep: failed to read deposit wallet balance', { error });
    return;
  }

  log('USDC.e sweep: deposit wallet balance', {
    depositWalletAddress,
    balance: usdceBalance.toString(),
  });

  if (usdceBalance === 0n) {
    log('USDC.e sweep: nothing to wrap');
    return;
  }

  try {
    const { transactionHash } = await submitDepositWalletBatch(messenger, {
      from,
      depositWalletAddress,
      calls: [
        {
          target: USDC_E_ADDRESS_POLYGON,
          value: 0n,
          data: encodeApprove(
            POLYMARKET_COLLATERAL_ONRAMP_POLYGON,
            usdceBalance,
          ),
        },
        {
          target: POLYMARKET_COLLATERAL_ONRAMP_POLYGON,
          value: 0n,
          data: encodeWrap({
            asset: USDC_E_ADDRESS_POLYGON,
            recipient: depositWalletAddress,
            amount: usdceBalance,
          }),
        },
      ],
    });

    log('USDC.e sweep: complete', { transactionHash });
  } catch (error) {
    log('USDC.e sweep: batch submission failed', { error });
  }
}

function extractRelayDepositAddress(relayQuote: RelayQuote): Hex {
  const depositStep = relayQuote.steps.find((step) => step.id === 'deposit');

  if (!depositStep || depositStep.kind !== 'transaction') {
    throw new Error(
      'Polymarket deposit wallet withdraw: Relay quote has no deposit step',
    );
  }

  const transactionStep = depositStep as RelayTransactionStep;
  const depositCallData = transactionStep.items[0]?.data?.data;

  if (!depositCallData) {
    throw new Error(
      'Polymarket deposit wallet withdraw: Relay quote deposit step is missing calldata',
    );
  }

  return extractErc20TransferRecipient(depositCallData);
}
