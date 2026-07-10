import { Interface } from '@ethersproject/abi';
import { Contract } from '@ethersproject/contracts';
import type { Provider } from '@ethersproject/providers';
import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { MUSD_TOKEN_ADDRESS_BY_CHAIN } from './musd';

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

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// -- Shared constants ------------------------------------------------------

const SLIPPAGE_NUMERATOR = BigInt(998);
const SLIPPAGE_DENOMINATOR = BigInt(1000);

/**
 * Apply a 0.2% slippage tolerance to a bigint value. If this sanity-check
 * causes a revert, no funds are lost — retry with a fresh quote.
 *
 * @param value - The value to apply slippage to.
 * @returns The value reduced by the slippage tolerance.
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
 * Result shape for Money Account transaction batch builders. The string keys
 * (e.g. `approveTx`, `withdrawTx`) name each call so callers don't depend on
 * positional ordering in `addTransactionBatch.transactions[]`.
 */
type MoneyAccountBatchResult<TxKey extends string> = Record<
  TxKey,
  MoneyAccountTxParams
>;

// -- Deposit helpers -------------------------------------------------------

/**
 * Preview the vault shares minted for a deposit via the lens contract.
 *
 * @param args - The preview arguments.
 * @param args.lensAddress - The lens contract address.
 * @param args.boringVault - The vault address.
 * @param args.accountantAddress - The accountant contract address.
 * @param args.musdAddress - The deposit asset (mUSD) address.
 * @param args.amount - The deposit amount in minimal units.
 * @param args.provider - The chain's read provider.
 * @returns The expected share amount.
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
 * Encode an ERC-20 `approve` for the vault.
 *
 * @param boringVault - The spender (vault) address.
 * @param amount - The approval amount in minimal units.
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
 * Encode an ERC-20 `transfer`.
 *
 * @param to - The recipient address.
 * @param amount - The transfer amount in minimal units.
 * @returns The encoded calldata.
 */
function buildErc20TransferData(to: string, amount: bigint): Hex {
  const iface = new Interface(ERC20_ABI);
  return iface.encodeFunctionData('transfer', [to, amount.toString()]) as Hex;
}

/**
 * Encode a teller `deposit`.
 *
 * @param musdAddress - The deposit asset (mUSD) address.
 * @param amount - The deposit amount in minimal units.
 * @param minimumMint - The minimum acceptable share amount.
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

export type MoneyAccountDepositBatchResult = MoneyAccountBatchResult<
  'approveTx' | 'depositTx'
>;

/**
 * Build the approve + deposit transaction pair for a Money Account deposit.
 *
 * 1. Calls `previewDeposit` on the lens contract to get expected vault shares.
 * 2. Applies a 0.2% slippage tolerance to derive `minimumMint`.
 * 3. Encodes ERC-20 `approve(boringVault, amount)` on the mUSD token.
 * 4. Encodes `deposit(mUSD, amount, minimumMint, 0x0)` on the teller contract.
 *
 * When `amount === 0n` the preview call is skipped: the caller is encoding a
 * zero-amount placeholder batch (e.g. initial deposit submission).
 *
 * @param args - The build arguments.
 * @param args.amount - The deposit amount in minimal units.
 * @param args.chainId - The chain to deposit on.
 * @param args.boringVault - The vault address.
 * @param args.tellerAddress - The teller contract address.
 * @param args.accountantAddress - The accountant contract address.
 * @param args.lensAddress - The lens contract address.
 * @param args.provider - The chain's read provider.
 * @returns The named approve + deposit transactions.
 */
export async function buildMoneyAccountDepositBatch({
  amount,
  chainId,
  boringVault,
  tellerAddress,
  accountantAddress,
  lensAddress,
  provider,
}: {
  amount: bigint;
  chainId: Hex;
  boringVault: string;
  tellerAddress: string;
  accountantAddress: string;
  lensAddress: string;
  provider: Provider;
}): Promise<MoneyAccountDepositBatchResult> {
  const musdAddress = getMoneyAccountDepositAssetAddress(chainId);

  // Skip the RPC call for zero-amount placeholder batches (e.g. initial deposit submission).
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

  const approveData = buildApproveData(boringVault, amount);
  const depositData = buildDepositData(musdAddress, amount, minimumMint);

  return {
    approveTx: {
      params: {
        to: musdAddress,
        data: approveData,
        value: '0x0' as Hex,
      },
      type: TransactionType.tokenMethodApprove,
    },
    depositTx: {
      params: {
        to: tellerAddress as Hex,
        data: depositData,
        value: '0x0' as Hex,
      },
      type: TransactionType.moneyAccountDeposit,
    },
  };
}

// -- Withdrawal helpers ----------------------------------------------------

/**
 * Read the current vault rate from the accountant contract.
 *
 * @param args - The read arguments.
 * @param args.accountantAddress - The accountant contract address.
 * @param args.provider - The chain's read provider.
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
 * Convert a USD asset amount (6 decimals) to vault shares given a pre-fetched
 * rate. Pure arithmetic — no I/O, safe to call directly inside workflows.
 *
 * Uses ceiling division so the contract's `mulDivDown(shares × rate / ONE_SHARE)`
 * always produces `assetsOut >= minimumAssets`. Floor division caused a double-
 * truncation bug where `assetsOut` could land 1 unit below `minimumAssets`,
 * reverting with `MinimumAssetsNotMet`.
 *
 * @param amount - The asset amount in minimal units.
 * @param rate - The current vault rate.
 * @returns The share amount to redeem.
 */
export function getSharesForWithdrawal(amount: bigint, rate: bigint): bigint {
  return (amount * SHARE_DECIMALS_SCALAR + rate - 1n) / rate;
}

/**
 * Encode a teller `withdraw`.
 *
 * @param musdAddress - The withdraw asset (mUSD) address.
 * @param shareAmount - The share amount to redeem.
 * @param minimumAssets - The minimum acceptable asset amount out.
 * @param toAddress - The address receiving the withdrawn assets.
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

/**
 * Build the two-transaction withdrawal batch for a Money Account withdrawal.
 *
 * 1. Calls `getRate` on the accountant contract to get the current vault rate.
 * 2. Converts the asset amount to vault shares.
 * 3. Encodes `withdraw(mUSD, shareAmount, minimumAssets, moneyAccountAddress)`
 * on the teller contract — USDC lands on the money account.
 * 4. Encodes `transfer(recipient, amount)` on the USDC contract — moves the
 * exact requested USDC from the money account to the user's selected EVM
 * account.
 *
 * When `amount === 0n` the rate fetch is skipped: the caller is encoding a
 * placeholder batch that MM Pay will re-encode once the user picks an amount.
 *
 * @param args - The build arguments.
 * @param args.amount - The withdrawal amount in minimal units.
 * @param args.chainId - The chain to withdraw on.
 * @param args.tellerAddress - The teller contract address.
 * @param args.accountantAddress - The accountant contract address.
 * @param args.moneyAccountAddress - Address of the money account — vault sends USDC here first.
 * @param args.recipient - Address of the user's selected EVM account — receives the USDC transfer.
 * @param args.provider - The chain's read provider.
 * @returns The named withdraw + transfer transactions.
 */
export async function buildMoneyAccountWithdrawBatch({
  amount,
  chainId,
  tellerAddress,
  accountantAddress,
  moneyAccountAddress,
  recipient,
  provider,
}: {
  amount: bigint;
  chainId: Hex;
  tellerAddress: Hex;
  accountantAddress: Hex;
  moneyAccountAddress: Hex;
  recipient: Hex;
  provider: Provider;
}): Promise<MoneyAccountWithdrawBatchResult> {
  const musdAddress = getMoneyAccountDepositAssetAddress(chainId);

  const shareAmount =
    amount === BigInt(0)
      ? BigInt(0)
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
        value: '0x0' as Hex,
      },
      type: TransactionType.moneyAccountWithdraw,
    },
    transferTx: {
      params: {
        to: musdAddress,
        data: transferData,
        value: '0x0' as Hex,
      },
      type: TransactionType.tokenMethodTransfer,
    },
  };
}
