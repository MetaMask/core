import type { BridgeControllerMessenger, QuoteRequest } from '../../types.js';
import {
  buildMoneyAccountWithdrawBatch,
  getMoneyAccountVaultConfig,
} from '@metamask/money-account-utils';
import { getFeatureFlags } from './remote-feature-flags.js';
import { getAccountByAddress } from './accounts.js';
import { CHAIN_IDS } from '../../constants/chains.js';
import { getNetworkClientByChainId } from './network.js';
import { Web3Provider } from '@ethersproject/providers';

/**
 * Resolves the primary money account and vault config to use for the money account deposit request
 *
 * UI: Money is dest token
 *
 * emvAccount swap X to MUSD at moneyAccount's evmAddress (swap + send)
 * moneyAccount's evmAddress deposit MUSD to moneyAccount
 *
 * @param params - The parameters for the function
 * @param params.messenger - The bridge-controller messenger instance
 * @param params.quoteRequest - The normalized quote request
 * @returns The money account deposit config, undefined if the dest wallet address is not a money account
 */
export const getMoneyAccountDepositSetup = async ({
  messenger,
  quoteRequest,
}: {
  messenger: BridgeControllerMessenger;
  quoteRequest: QuoteRequest;
}) => {
  // Get primary money account for dest wallet address
  const depositor = getAccountByAddress(
    messenger,
    quoteRequest.destWalletAddress ?? quoteRequest.walletAddress,
  );
  if (!depositor?.id) {
    return undefined;
  }
  const primaryMoneyAccount = messenger.call(
    'MoneyAccountController:getMoneyAccount',
    { id: depositor.id },
  );
  if (!primaryMoneyAccount) {
    return undefined;
  }
  if (!primaryMoneyAccount.address) {
    return undefined;
  }

  // Get vault config
  const ff = getFeatureFlags(messenger);
  const vaultConfig = getMoneyAccountVaultConfig(ff);
  if (!vaultConfig) {
    return undefined;
  }

  const {
    chainId,
    boringVault,
    tellerAddress,
    accountantAddress,
    lensAddress,
  } = vaultConfig;

  return {
    chainIdHex: chainId,
    boringVault,
    tellerAddress,
    accountantAddress,
    lensAddress,
    moneyAccountAddress: primaryMoneyAccount.address as `0x${string}`,
    isGasFeeSponsored: CHAIN_IDS.MONAD === chainId,
  };
};

/**
 * Resolves the primary money account and vault config to use for the money account withdrawal request
 *
 * UI: Money is src token
 *
 * moneyAccount withdraw MUSD to wallet evmAddress (srcWalletAddress)
 * If destToken assetId assetIdsMatch MUSD@moneyChain, noop
 * wallet evmAddress swap MUSD to destToken at destWalletAddress (swap + send)
 *
 * @param params - The parameters for the function
 * @param params.messenger - The bridge-controller messenger instance
 * @param params.quoteRequest - The normalized quote request
 * @returns The money account deposit config, undefined if the dest wallet address is not a money account
 */
export const getMoneyAccountWithdrawalTxs = async ({
  messenger,
  quoteRequest,
}: {
  messenger: BridgeControllerMessenger;
  quoteRequest: QuoteRequest;
}) => {
  // TODO return empty if not a withdrawal

  // Get primary money account for swap tx's src wallet address
  const recipient = getAccountByAddress(messenger, quoteRequest.walletAddress);
  const recipientId = recipient?.id;
  if (!recipientId) {
    return undefined;
  }
  const primaryMoneyAccount = messenger.call(
    'MoneyAccountController:getMoneyAccount',
    { id: recipientId },
  );
  if (!primaryMoneyAccount) {
    return undefined;
  }
  if (!primaryMoneyAccount.address) {
    return undefined;
  }

  // Get vault config
  const ff = getFeatureFlags(messenger);
  const vaultConfig = getMoneyAccountVaultConfig(ff);
  if (!vaultConfig) {
    return undefined;
  }

  const { chainId, tellerAddress, accountantAddress } = vaultConfig;

  // Get provider for the src chain
  const provider = getNetworkClientByChainId(
    messenger,
    quoteRequest.srcChainId,
  ).provider;
  if (!provider) {
    throw new Error(
      `No provider available for chain ${quoteRequest.srcChainId}`,
    );
  }
  const ethersProvider = new Web3Provider(provider);

  const { withdrawTx, transferTx } = await buildMoneyAccountWithdrawBatch({
    amount: BigInt(quoteRequest.srcTokenAmount),
    chainId,
    tellerAddress: tellerAddress,
    accountantAddress: accountantAddress,
    moneyAccountAddress: primaryMoneyAccount.address as `0x${string}`,
    recipient: recipient?.address as `0x${string}`,
    provider: ethersProvider,
  });

  return {
    withdraw: { ...withdrawTx, from: primaryMoneyAccount.address },
    transfer: { ...transferTx, from: primaryMoneyAccount.address },
  };
};
