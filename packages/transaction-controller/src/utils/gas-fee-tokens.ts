import type EthQuery from '@metamask/eth-query';
import { rpcErrors } from '@metamask/rpc-errors';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { isNativeBalanceSufficientForGas } from './balance';
import { ERROR_MESSAGE_NO_UPGRADE_CONTRACT } from './batch';
import { ERROR_MESSGE_PUBLIC_KEY, doesChainSupportEIP7702 } from './eip7702';
import { getEIP7702UpgradeContractAddress } from './feature-flags';
import type {
  GasFeeToken,
  TransactionControllerMessenger,
  TransactionMeta,
} from '..';
import type { SimulationRequestTransaction } from '../api/simulation-api';
import {
  simulateTransactions,
  type SimulationResponse,
  type SimulationResponseTransaction,
} from '../api/simulation-api';
import { projectLogger } from '../logger';
import type { GetSimulationConfig } from '../types';

const log = createModuleLogger(projectLogger, 'gas-fee-tokens');

export type GetGasFeeTokensRequest = {
  chainId: Hex;
  isEIP7702GasFeeTokensEnabled: (
    transactionMeta: TransactionMeta,
  ) => Promise<boolean>;
  getSimulationConfig: GetSimulationConfig;
  messenger: TransactionControllerMessenger;
  publicKeyEIP7702?: Hex;
  transactionMeta: TransactionMeta;
};

/**
 * Get gas fee tokens for a transaction.
 *
 * @param request - The request object.
 * @param request.chainId - The chain ID of the transaction.
 * @param request.isEIP7702GasFeeTokensEnabled - Callback to check if EIP-7702 gas fee tokens are enabled.
 * @param request.messenger - The messenger instance.
 * @param request.publicKeyEIP7702 - Public key to validate EIP-7702 contract signatures.
 * @param request.transactionMeta - The transaction metadata.
 * @param request.getSimulationConfig - Optional transaction simulation parameters.
 * @returns An array of gas fee tokens.
 */
export async function getGasFeeTokens({
  chainId,
  isEIP7702GasFeeTokensEnabled,
  messenger,
  publicKeyEIP7702,
  transactionMeta,
  getSimulationConfig,
}: GetGasFeeTokensRequest) {
  const { delegationAddress, txParams } = transactionMeta;
  const { authorizationList: authorizationListRequest } = txParams;
  const data = txParams.data as Hex;
  const from = txParams.from as Hex;
  const to = txParams.to as Hex;
  const value = txParams.value as Hex;

  log('Request', { chainId, txParams });

  const is7702GasFeeTokensEnabled =
    await isEIP7702GasFeeTokensEnabled(transactionMeta);

  const with7702 =
    is7702GasFeeTokensEnabled && doesChainSupportEIP7702(chainId, messenger);

  let authorizationList:
    | SimulationRequestTransaction['authorizationList']
    | undefined = authorizationListRequest?.map((authorization) => ({
    address: authorization.address,
    from,
  }));

  if (with7702 && !delegationAddress && !authorizationList) {
    authorizationList = buildAuthorizationList({
      chainId,
      from,
      messenger,
      publicKeyEIP7702,
    });
  }

  try {
    const response = await simulateTransactions(chainId, {
      getSimulationConfig,
      transactions: [
        {
          authorizationList,
          data,
          from,
          to,
          value,
        },
      ],
      suggestFees: {
        withTransfer: true,
        withFeeTransfer: true,
        with7702,
      },
    });

    log('Response', response);

    const result = parseGasFeeTokens(response);

    log('Gas fee tokens', result);

    return result;
  } catch (error) {
    log('Failed to gas fee tokens', error);
    return { gasFeeTokens: [], isGasFeeSponsored: false };
  }
}

/**
 * Check and update gas fee token selection before publishing a transaction.
 *
 * @param request - Request object.
 * @param request.ethQuery - EthQuery instance.
 * @param request.fetchGasFeeTokens - Function to fetch gas fee tokens.
 * @param request.transaction - Transaction metadata.
 * @param request.updateTransaction - Function to update the transaction.
 */
export async function checkGasFeeTokenBeforePublish({
  ethQuery,
  fetchGasFeeTokens,
  transaction,
  updateTransaction,
}: {
  ethQuery: EthQuery;
  fetchGasFeeTokens: (transaction: TransactionMeta) => Promise<GasFeeToken[]>;
  transaction: TransactionMeta;
  updateTransaction: (
    transactionId: string,
    fn: (tx: TransactionMeta) => void,
  ) => void;
}) {
  const { isGasFeeTokenIgnoredIfBalance, selectedGasFeeToken } = transaction;

  if (!selectedGasFeeToken || !isGasFeeTokenIgnoredIfBalance) {
    return;
  }

  log('Checking gas fee token before publish', { selectedGasFeeToken });

  const hasNativeBalance = await isNativeBalanceSufficientForGas(
    transaction,
    ethQuery,
  );

  if (hasNativeBalance) {
    log(
      'Ignoring gas fee token before publish due to sufficient native balance',
    );

    updateTransaction(transaction.id, (tx) => {
      tx.isExternalSign = false;
      tx.selectedGasFeeToken = undefined;
    });

    return;
  }

  const gasFeeTokens = await fetchGasFeeTokens({
    ...transaction,
    isExternalSign: true,
  });

  updateTransaction(transaction.id, (tx) => {
    tx.gasFeeTokens = gasFeeTokens;
    tx.isExternalSign = true;
    tx.txParams.nonce = undefined;
  });

  log('Updated gas fee tokens before publish', gasFeeTokens);

  if (
    !gasFeeTokens?.some(
      (t) => t.tokenAddress.toLowerCase() === selectedGasFeeToken.toLowerCase(),
    )
  ) {
    throw new Error('Gas fee token not found and insufficient native balance');
  }

  log('Publishing with selected gas fee token', { selectedGasFeeToken });
}

/**
 * Extract gas fee tokens from a simulation response.
 *
 * @param response - The simulation response.
 * @returns gasFeeTokens: An array of gas fee tokens. isGasFeeSponsored: Whether the transaction is sponsored
 */
function parseGasFeeTokens(response: SimulationResponse): {
  gasFeeTokens: GasFeeToken[];
  isGasFeeSponsored: boolean;
} {
  const feeLevel = response.transactions?.[0]
    ?.fees?.[0] as Required<SimulationResponseTransaction>['fees'][0];

  const isGasFeeSponsored = response.sponsorship?.isSponsored ?? false;

  const tokenFees = feeLevel?.tokenFees ?? [];

  return {
    gasFeeTokens: tokenFees.map((tokenFee) => ({
      amount: tokenFee.balanceNeededToken,
      balance: tokenFee.currentBalanceToken,
      decimals: tokenFee.token.decimals,
      fee: tokenFee.serviceFee,
      gas: feeLevel.gas,
      gasTransfer: tokenFee.transferEstimate,
      maxFeePerGas: feeLevel.maxFeePerGas,
      maxPriorityFeePerGas: feeLevel.maxPriorityFeePerGas,
      rateWei: tokenFee.rateWei,
      recipient: tokenFee.feeRecipient,
      symbol: tokenFee.token.symbol,
      tokenAddress: tokenFee.token.address,
    })),
    isGasFeeSponsored,
  };
}

/**
 * Generate the authorization list for the request.
 *
 * @param request - The request object.
 * @param request.chainId - The chain ID.
 * @param request.from - The sender's address.
 * @param request.messenger - The messenger instance.
 * @param request.publicKeyEIP7702 - The public key for EIP-7702.
 * @returns The authorization list.
 */
function buildAuthorizationList({
  chainId,
  from,
  messenger,
  publicKeyEIP7702,
}: {
  chainId: Hex;
  from: Hex;
  messenger: TransactionControllerMessenger;
  publicKeyEIP7702?: Hex;
}): SimulationRequestTransaction['authorizationList'] | undefined {
  if (!publicKeyEIP7702) {
    throw rpcErrors.internal(ERROR_MESSGE_PUBLIC_KEY);
  }

  const upgradeAddress = getEIP7702UpgradeContractAddress(
    chainId,
    messenger,
    publicKeyEIP7702,
  );

  if (!upgradeAddress) {
    throw rpcErrors.internal(ERROR_MESSAGE_NO_UPGRADE_CONTRACT);
  }

  return [
    {
      address: upgradeAddress,
      from,
    },
  ];
}
