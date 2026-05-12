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

const log = createModuleLogger(projectLogger, 'polymarket-withdraw');

export async function applyPolymarketDepositWalletOverrides(
  body: RelayQuoteRequest,
  request: QuoteRequest,
  messenger: TransactionPayControllerMessenger,
): Promise<void> {
  const depositWalletAddress = await getDepositWalletAddress(
    messenger,
    request.from,
  );

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
  const depositWalletAddress = await getDepositWalletAddress(messenger, from);
  const relayDepositAddress = extractRelayDepositAddress(quote.original);
  const amount = BigInt(quote.sourceAmount.raw);

  log('Submitting unwrap batch to Relay deposit address', {
    depositWalletAddress,
    relayDepositAddress,
    amount: amount.toString(),
  });

  return await submitDepositWalletBatch(messenger, {
    eoa: from,
    depositWallet: depositWalletAddress,
    calls: [
      {
        target: PUSD_ADDRESS_POLYGON,
        value: '0',
        data: encodeApprove(POLYMARKET_COLLATERAL_OFFRAMP_POLYGON, amount),
      },
      {
        target: POLYMARKET_COLLATERAL_OFFRAMP_POLYGON,
        value: '0',
        data: encodeUnwrap({
          asset: USDC_E_ADDRESS_POLYGON,
          recipient: relayDepositAddress,
          amount,
        }),
      },
    ],
  });
}

export async function sweepPolymarketDepositWallet(
  from: Hex,
  messenger: TransactionPayControllerMessenger,
): Promise<void> {
  const depositWalletAddress = await getDepositWalletAddress(messenger, from);

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
    await submitDepositWalletBatch(messenger, {
      eoa: from,
      depositWallet: depositWalletAddress,
      calls: [
        {
          target: USDC_E_ADDRESS_POLYGON,
          value: '0',
          data: encodeApprove(
            POLYMARKET_COLLATERAL_ONRAMP_POLYGON,
            usdceBalance,
          ),
        },
        {
          target: POLYMARKET_COLLATERAL_ONRAMP_POLYGON,
          value: '0',
          data: encodeWrap({
            asset: USDC_E_ADDRESS_POLYGON,
            recipient: depositWalletAddress,
            amount: usdceBalance,
          }),
        },
      ],
    });
  } catch (error) {
    log('USDC.e sweep: batch submission failed', { error });
  }
}

async function getDepositWalletAddress(
  messenger: TransactionPayControllerMessenger,
  eoa: Hex,
): Promise<Hex> {
  const depositWalletAddress = await messenger.call(
    'TransactionPayController:polymarketGetDepositWalletAddress',
    { eoa },
  );
  log('Polymarket callback: getDepositWalletAddress', {
    eoa,
    depositWalletAddress,
  });
  return depositWalletAddress;
}

async function submitDepositWalletBatch(
  messenger: TransactionPayControllerMessenger,
  params: {
    eoa: Hex;
    depositWallet: Hex;
    calls: { target: Hex; data: Hex; value: string }[];
  },
): Promise<{ sourceHash: Hex }> {
  log('Polymarket callback: submitDepositWalletBatch', {
    eoa: params.eoa,
    depositWallet: params.depositWallet,
    callCount: params.calls.length,
  });
  const result = await messenger.call(
    'TransactionPayController:polymarketSubmitDepositWalletBatch',
    params,
  );
  log('Polymarket callback: submitDepositWalletBatch returned', {
    sourceHash: result.sourceHash,
  });
  return result;
}

function extractRelayDepositAddress(relayQuote: RelayQuote): Hex {
  const depositStep = relayQuote.steps.find((step) => step.id === 'deposit');

  if (depositStep?.kind !== 'transaction') {
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
