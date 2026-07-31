import { Interface } from '@ethersproject/abi';
import type { Provider } from '@ethersproject/abstract-provider';
import { Contract } from '@ethersproject/contracts';
import { TransactionType } from '@metamask/transaction-controller';
import type { CaipAssetType, Hex } from '@metamask/utils';

import {
  MUSD_TOKEN_ADDRESS_BY_CHAIN,
  MUSD_TOKEN_ASSET_ID_BY_CHAIN,
} from './musd.js';

const LENS_ABI = [
  'function previewDeposit(address depositAsset, uint256 depositAmount, address boringVault, address accountant) view returns (uint256 shares)',
];

export const TELLER_ABI = [
  'function deposit(address depositAsset, uint256 depositAmount, uint256 minimumMint, address referralAddress) payable returns (uint256 shares)',
  'function withdraw(address withdrawAsset, uint256 shareAmount, uint256 minimumAssets, address to) returns (uint256 assetsOut)',
];

const ACCOUNTANT_ABI = ['function getRate() view returns (uint256 rate)'];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount)',
  'function transfer(address to, uint256 amount)',
];

/**
 * Referral address passed to the teller's `deposit` call. The Money Account
 * deposit flow has no referrer, so the zero address is sent explicitly.
 */
const ZERO_ADDRESS: Hex = '0x0000000000000000000000000000000000000000';

// -- Shared constants ------------------------------------------------------

const SLIPPAGE_NUMERATOR = BigInt(998);
const SLIPPAGE_DENOMINATOR = BigInt(1000);

/**
 * Applies a 0.2% slippage tolerance to a bigint value.
 * If this sanity-check causes a revert, no funds are lost — retry with a fresh quote.
 *
 * @param value - The value to apply the slippage tolerance to.
 * @returns The value reduced by the slippage tolerance, truncated to an integer.
 */
export function applySlippage(value: bigint): bigint {
  return (value * SLIPPAGE_NUMERATOR) / SLIPPAGE_DENOMINATOR;
}

// -- Shared types ----------------------------------------------------------

export type MoneyAccountTxParams = {
  params: {
    to: Hex;
    data: Hex;
    value: Hex;
  };
  type: TransactionType;
};

/**
 * A Money Account call with its target and type resolved but no calldata, for
 * placeholder batches that Pay re-encodes once the user picks an amount.
 * Distinct from {@link MoneyAccountTxParams} so callers of the encoding
 * builders never have to narrow an optional `data`.
 */
export type MoneyAccountPlaceholderTxParams = {
  params: {
    to: Hex;
    value: Hex;
  };
  type: TransactionType;
};

/**
 * Result shape for Money Account transaction batch builders. The string keys
 * (e.g. `approveTx`, `withdrawTx`) name each call so callers don't depend on
 * positional ordering in `addTransactionBatch.transactions[]`.
 */
type MoneyAccountBatchResult<TxKey extends string> = Record<
  TxKey,
  MoneyAccountTxParams
>;

/**
 * Result shape for the placeholder variants of the batch builders. Mirrors
 * {@link MoneyAccountBatchResult} but without calldata.
 */
type MoneyAccountPlaceholderBatchResult<TxKey extends string> = Record<
  TxKey,
  MoneyAccountPlaceholderTxParams
>;

// -- Deposit helpers -------------------------------------------------------

/**
 * Reads the vault shares a deposit of `amount` would mint, via the lens
 * contract's `previewDeposit`.
 *
 * @param options - Options bag.
 * @param options.lensAddress - Address of the vault lens contract.
 * @param options.boringVault - Address of the boring vault.
 * @param options.accountantAddress - Address of the vault accountant contract.
 * @param options.musdAddress - Address of the mUSD deposit asset.
 * @param options.amount - Deposit amount in mUSD base units.
 * @param options.provider - Provider used for the read call.
 * @returns The expected vault shares.
 */
async function getExpectedDepositShares({
  lensAddress,
  boringVault,
  accountantAddress,
  musdAddress,
  amount,
  provider,
}: {
  lensAddress: string;
  boringVault: string;
  accountantAddress: string;
  musdAddress: string;
  amount: bigint;
  provider: Provider;
}): Promise<bigint> {
  const lensContract = new Contract(lensAddress, LENS_ABI, provider);
  const shares = await lensContract.previewDeposit(
    musdAddress,
    amount.toString(),
    boringVault,
    accountantAddress,
  );
  return BigInt(shares.toString());
}

/**
 * Encodes the ERC-20 `approve` call granting the boring vault an allowance.
 *
 * @param boringVault - Address to approve as spender.
 * @param amount - Allowance in mUSD base units.
 * @returns The encoded calldata.
 */
function buildApproveData(boringVault: string, amount: bigint): Hex {
  const iface = new Interface(ERC20_ABI);
  return iface.encodeFunctionData('approve', [
    boringVault,
    amount.toString(),
  ]) as Hex;
}

/**
 * Encodes an ERC-20 `transfer` call.
 *
 * @param to - Recipient of the transfer.
 * @param amount - Transfer amount in token base units.
 * @returns The encoded calldata.
 */
function buildErc20TransferData(to: string, amount: bigint): Hex {
  const iface = new Interface(ERC20_ABI);
  return iface.encodeFunctionData('transfer', [to, amount.toString()]) as Hex;
}

/**
 * Encodes the teller's `deposit` call.
 *
 * @param musdAddress - Address of the mUSD deposit asset.
 * @param amount - Deposit amount in mUSD base units.
 * @param minimumMint - Minimum vault shares the deposit must mint.
 * @returns The encoded calldata.
 */
function buildDepositData(
  musdAddress: string,
  amount: bigint,
  minimumMint: bigint,
): Hex {
  const iface = new Interface(TELLER_ABI);
  return iface.encodeFunctionData('deposit', [
    musdAddress,
    amount.toString(),
    minimumMint.toString(),
    ZERO_ADDRESS,
  ]) as Hex;
}

/**
 * Single source of truth for the deposit asset so both calldata encoding
 * (`buildMoneyAccountDepositBatch`) and Pay's `requiredAssets` agree.
 *
 * @param chainId - The chain ID to get the deposit asset address for.
 * @returns The deposit asset address for the given chain ID.
 */
export function getMoneyAccountDepositAssetAddress(chainId: Hex): Hex {
  const musdAddress = MUSD_TOKEN_ADDRESS_BY_CHAIN[chainId];
  if (!musdAddress) {
    throw new Error(`mUSD not deployed on chain ${chainId}`);
  }
  return musdAddress;
}

/**
 * Resolves the CAIP-19 asset id of the Money Account deposit asset (mUSD) for a
 * given chain. Pure mapping over `MUSD_TOKEN_ASSET_ID_BY_CHAIN`.
 *
 * Returns `undefined` for a chain mUSD is not deployed on, so an unsupported
 * chain stays distinguishable from a supported one. Clients that want a default
 * (e.g. Money Account being Monad-only today) apply it at the call site:
 * `getMoneyAccountDepositAssetId(chainId) ??
 * MUSD_TOKEN_ASSET_ID_BY_CHAIN[CHAIN_IDS.MONAD]`.
 *
 * @param chainId - The chain ID to get the deposit asset id for.
 * @returns The CAIP-19 asset id of the deposit asset, or `undefined` if mUSD is
 * not deployed on the given chain.
 */
export function getMoneyAccountDepositAssetId(
  chainId?: Hex,
): CaipAssetType | undefined {
  if (!chainId) {
    return undefined;
  }
  return MUSD_TOKEN_ASSET_ID_BY_CHAIN[chainId];
}

export type MoneyAccountDepositBatchResult = MoneyAccountBatchResult<
  'approveTx' | 'depositTx'
>;

export type MoneyAccountDepositPlaceholderBatchResult =
  MoneyAccountPlaceholderBatchResult<'approveTx' | 'depositTx'>;

export type BuildMoneyAccountDepositBatchOptions = {
  amount: bigint;
  chainId: Hex;
  boringVault: Hex;
  tellerAddress: Hex;
  accountantAddress: Hex;
  lensAddress: Hex;
  provider: Provider;
};

export type BuildMoneyAccountDepositPlaceholderBatchOptions = {
  chainId: Hex;
  tellerAddress: Hex;
};

/**
 * Builds the approve + deposit transaction pair for a Money Account deposit.
 *
 * 1. Calls `previewDeposit` on the lens contract to get expected vault shares.
 * 2. Applies a 0.2% slippage tolerance to derive `minimumMint`.
 * 3. Encodes ERC-20 `approve(boringVault, amount)` on the mUSD token.
 * 4. Encodes `deposit(mUSD, amount, minimumMint, 0x0)` on the teller contract.
 *
 * For placeholder batches with no amount yet, use
 * {@link buildMoneyAccountDepositPlaceholderBatch} instead — it needs neither a
 * provider nor the vault read.
 *
 * @param options - Options bag.
 * @param options.amount - Deposit amount in mUSD base units.
 * @param options.chainId - Chain the deposit happens on.
 * @param options.boringVault - Address of the boring vault.
 * @param options.tellerAddress - Address of the teller contract.
 * @param options.accountantAddress - Address of the vault accountant contract.
 * @param options.lensAddress - Address of the vault lens contract.
 * @param options.provider - Provider used for the `previewDeposit` read.
 * @returns The approve and deposit transactions, keyed by name.
 */
export async function buildMoneyAccountDepositBatch({
  amount,
  chainId,
  boringVault,
  tellerAddress,
  accountantAddress,
  lensAddress,
  provider,
}: BuildMoneyAccountDepositBatchOptions): Promise<MoneyAccountDepositBatchResult> {
  const musdAddress = getMoneyAccountDepositAssetAddress(chainId);

  // Nothing to preview for a zero-amount deposit, so skip the RPC call.
  const minimumMint =
    amount === 0n
      ? 0n
      : applySlippage(
          await getExpectedDepositShares({
            lensAddress,
            boringVault,
            accountantAddress,
            musdAddress,
            amount,
            provider,
          }),
        );

  return {
    approveTx: {
      params: {
        to: musdAddress,
        data: buildApproveData(boringVault, amount),
        value: '0x0',
      },
      type: TransactionType.tokenMethodApprove,
    },
    depositTx: {
      params: {
        to: tellerAddress,
        data: buildDepositData(musdAddress, amount, minimumMint),
        value: '0x0',
      },
      type: TransactionType.moneyAccountDeposit,
    },
  };
}

/**
 * Builds the approve + deposit pair for a Money Account deposit *without*
 * calldata, for placeholder batches that Pay re-encodes once the user picks an
 * amount. Resolves the call targets and types only, so it performs no vault
 * reads and needs no provider.
 *
 * @param options - Options bag.
 * @param options.chainId - Chain the deposit happens on.
 * @param options.tellerAddress - Address of the teller contract.
 * @returns The approve and deposit transaction targets, keyed by name.
 */
export function buildMoneyAccountDepositPlaceholderBatch({
  chainId,
  tellerAddress,
}: BuildMoneyAccountDepositPlaceholderBatchOptions): MoneyAccountDepositPlaceholderBatchResult {
  return {
    approveTx: {
      params: {
        to: getMoneyAccountDepositAssetAddress(chainId),
        value: '0x0',
      },
      type: TransactionType.tokenMethodApprove,
    },
    depositTx: {
      params: {
        to: tellerAddress,
        value: '0x0',
      },
      type: TransactionType.moneyAccountDeposit,
    },
  };
}

// -- Withdrawal helpers ----------------------------------------------------

/**
 * Reads the current vault exchange rate from the accountant contract.
 *
 * @param options - Options bag.
 * @param options.accountantAddress - Address of the vault accountant contract.
 * @param options.provider - Provider used for the read call.
 * @returns The current vault rate.
 */
async function getVaultRate({
  accountantAddress,
  provider,
}: {
  accountantAddress: string;
  provider: Provider;
}): Promise<bigint> {
  const accountant = new Contract(accountantAddress, ACCOUNTANT_ABI, provider);
  const rate = await accountant.getRate();
  return BigInt(rate.toString());
}

const SHARE_DECIMALS_SCALAR = BigInt(1_000_000);

/**
 * Converts a USD asset amount (6 decimals) to vault shares given a pre-fetched rate.
 * Pure arithmetic — no I/O, safe to call directly inside workflows.
 *
 * Uses ceiling division so the contract's `mulDivDown(shares × rate / ONE_SHARE)`
 * always produces `assetsOut >= minimumAssets`. Floor division caused a double-
 * truncation bug where `assetsOut` could land 1 unit below `minimumAssets`,
 * reverting with `MinimumAssetsNotMet`.
 *
 * @param amount - The asset amount in mUSD base units.
 * @param rate - The current vault rate.
 * @returns The vault shares needed to withdraw `amount`.
 */
export function getSharesForWithdrawal(amount: bigint, rate: bigint): bigint {
  return (amount * SHARE_DECIMALS_SCALAR + rate - 1n) / rate;
}

/**
 * Encodes the teller's `withdraw` call.
 *
 * @param musdAddress - Address of the mUSD withdraw asset.
 * @param shareAmount - Vault shares to redeem.
 * @param minimumAssets - Minimum assets the redemption must return.
 * @param toAddress - Address that receives the redeemed assets.
 * @returns The encoded calldata.
 */
function buildWithdrawData(
  musdAddress: string,
  shareAmount: bigint,
  minimumAssets: bigint,
  toAddress: string,
): Hex {
  const iface = new Interface(TELLER_ABI);
  return iface.encodeFunctionData('withdraw', [
    musdAddress,
    shareAmount.toString(),
    minimumAssets.toString(),
    toAddress,
  ]) as Hex;
}

export type MoneyAccountWithdrawBatchResult = MoneyAccountBatchResult<
  'withdrawTx' | 'transferTx'
>;

export type BuildMoneyAccountWithdrawBatchOptions = {
  amount: bigint;
  chainId: Hex;
  tellerAddress: Hex;
  accountantAddress: Hex;
  /** Address of the money account — vault sends the redeemed mUSD here first. */
  moneyAccountAddress: Hex;
  /** Address of the user's selected EVM account — receives the mUSD transfer. */
  recipient: Hex;
  provider: Provider;
};

/**
 * Builds the two-transaction withdrawal batch for a Money Account withdrawal.
 *
 * 1. Calls `getRate` on the accountant contract to get the current vault rate.
 * 2. Converts the asset amount to vault shares.
 * 3. Encodes `withdraw(mUSD, shareAmount, minimumAssets, moneyAccountAddress)` on the teller contract — the redeemed mUSD lands on the money account.
 * 4. Encodes `transfer(recipient, amount)` on the mUSD token contract — moves the exact requested amount from the money account to the user's selected EVM account.
 *
 * When `amount === 0n` the rate fetch is skipped: the caller is encoding a
 * placeholder batch that Pay will re-encode once the user picks an amount.
 *
 * @param options - Options bag.
 * @param options.amount - Withdrawal amount in mUSD base units.
 * @param options.chainId - Chain the withdrawal happens on.
 * @param options.tellerAddress - Address of the teller contract.
 * @param options.accountantAddress - Address of the vault accountant contract.
 * @param options.moneyAccountAddress - Money account address; the vault sends
 * the redeemed assets here first.
 * @param options.recipient - Address that receives the subsequent transfer.
 * @param options.provider - Provider used for the `getRate` read.
 * @returns The withdraw and transfer transactions, keyed by name.
 */
export async function buildMoneyAccountWithdrawBatch({
  amount,
  chainId,
  tellerAddress,
  accountantAddress,
  moneyAccountAddress,
  recipient,
  provider,
}: BuildMoneyAccountWithdrawBatchOptions): Promise<MoneyAccountWithdrawBatchResult> {
  const musdAddress = getMoneyAccountDepositAssetAddress(chainId);

  const shareAmount =
    amount === 0n
      ? 0n
      : getSharesForWithdrawal(
          amount,
          await getVaultRate({ accountantAddress, provider }),
        );
  // Allow 1-unit slippage on minimumAssets as defense-in-depth against
  // rounding: the contract's mulDivDown can truncate assetsOut by up to
  // 1 unit relative to the requested amount. This tolerance is safe
  // because ceiling division in getSharesForWithdrawal already guarantees
  // assetsOut >= amount; the 1-unit slack here is a second line of
  // defense, not a standalone fix. The subsequent ERC-20 transfer uses
  // the original `amount`, so the tolerance does not affect how much the
  // user receives — it only prevents a spurious revert from the teller's
  // MinimumAssetsNotMet check.
  const minimumAssets = amount > 0n ? amount - 1n : 0n;
  const withdrawData = buildWithdrawData(
    musdAddress,
    shareAmount,
    minimumAssets,
    moneyAccountAddress,
  );
  const transferData = buildErc20TransferData(recipient, amount);

  return {
    withdrawTx: {
      params: {
        to: tellerAddress,
        data: withdrawData,
        value: '0x0',
      },
      type: TransactionType.moneyAccountWithdraw,
    },
    transferTx: {
      params: {
        to: musdAddress,
        data: transferData,
        value: '0x0',
      },
      type: TransactionType.tokenMethodTransfer,
    },
  };
}
