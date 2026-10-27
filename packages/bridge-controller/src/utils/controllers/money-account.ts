import type { BridgeControllerMessenger, QuoteRequest } from '../../types.js';
import { getMoneyAccountVaultConfig } from '@metamask/money-account-utils';
import { getFeatureFlags } from './remote-feature-flags.js';
import { getAccountByAddress } from './accounts.js';
import { CHAIN_IDS } from '../../constants/chains.js';

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
  )?.id;
  if (!depositor) {
    return undefined;
  }
  const primaryMoneyAccount = messenger.call(
    'MoneyAccountController:getMoneyAccount',
    { id: depositor },
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
