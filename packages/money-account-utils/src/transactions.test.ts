import type { Result } from '@ethersproject/abi';
import { Interface } from '@ethersproject/abi';
import type { Provider } from '@ethersproject/abstract-provider';
import { Contract } from '@ethersproject/contracts';
import { CHAIN_IDS, TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { MUSD_TOKEN_ADDRESS, MUSD_TOKEN_ASSET_ID_BY_CHAIN } from './musd.js';
import {
  applySlippage,
  buildMoneyAccountDepositBatch,
  buildMoneyAccountDepositPlaceholderBatch,
  buildMoneyAccountWithdrawBatch,
  getMoneyAccountDepositAssetAddress,
  getMoneyAccountDepositAssetId,
  getSharesForWithdrawal,
  TELLER_ABI,
} from './transactions.js';

jest.mock('@ethersproject/contracts');

const MockContract = Contract as jest.MockedClass<typeof Contract>;

const CHAIN_ID = CHAIN_IDS.MONAD;
const UNSUPPORTED_CHAIN_ID = '0xdead' as Hex;
const BORING_VAULT = '0xB5F07d769dD60fE54c97dd53101181073DDf21b2' as Hex;
const TELLER = '0x86821F179eaD9F0b3C79b2f8deF0227eEBFDc9f9' as Hex;
const ACCOUNTANT = '0x800ebc3B74F67EaC27C9CCE4E4FF28b17CdCA173' as Hex;
const LENS = '0x846a7832022350434B5cC006d07cc9c782469660' as Hex;
const MONEY_ACCOUNT_ADDRESS =
  '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as Hex;
const RECIPIENT_ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const PROVIDER = {} as Provider;

const ERC20_INTERFACE = new Interface([
  'function approve(address spender, uint256 amount)',
  'function transfer(address to, uint256 amount)',
]);
const TELLER_INTERFACE = new Interface(TELLER_ABI);

const previewDeposit = jest.fn();
const getRate = jest.fn();

/**
 * Builds the arguments for a deposit batch, with defaults for every vault
 * address so each test only states what it cares about.
 *
 * @param overrides - Argument overrides.
 * @returns The deposit batch arguments.
 */
function depositArgs(
  overrides: Partial<Parameters<typeof buildMoneyAccountDepositBatch>[0]> = {},
): Parameters<typeof buildMoneyAccountDepositBatch>[0] {
  return {
    amount: BigInt(1_000_000),
    chainId: CHAIN_ID,
    boringVault: BORING_VAULT,
    tellerAddress: TELLER,
    accountantAddress: ACCOUNTANT,
    lensAddress: LENS,
    provider: PROVIDER,
    ...overrides,
  };
}

/**
 * Builds the arguments for a withdraw batch, with defaults for every vault
 * address so each test only states what it cares about.
 *
 * @param overrides - Argument overrides.
 * @returns The withdraw batch arguments.
 */
function withdrawArgs(
  overrides: Partial<Parameters<typeof buildMoneyAccountWithdrawBatch>[0]> = {},
): Parameters<typeof buildMoneyAccountWithdrawBatch>[0] {
  return {
    amount: BigInt(1_000_000),
    chainId: CHAIN_ID,
    tellerAddress: TELLER,
    accountantAddress: ACCOUNTANT,
    moneyAccountAddress: MONEY_ACCOUNT_ADDRESS,
    recipient: RECIPIENT_ADDRESS,
    provider: PROVIDER,
    ...overrides,
  };
}

/**
 * Asserts two addresses are equal, ignoring case. Decoded calldata comes back
 * EIP-55 checksummed regardless of the casing that was encoded.
 *
 * @param actual - The address to check.
 * @param expected - The address it should equal.
 */
function expectSameAddress(actual: string, expected: string): void {
  expect(actual.toLowerCase()).toBe(expected.toLowerCase());
}

/**
 * Decodes the arguments of an encoded teller call.
 *
 * @param name - The teller function that was encoded.
 * @param data - The encoded calldata.
 * @returns The decoded arguments.
 */
function decodeTellerCall(
  name: 'deposit' | 'withdraw',
  data: Hex | undefined,
): Result {
  if (!data) {
    throw new Error(`Expected ${name} calldata`);
  }
  return TELLER_INTERFACE.decodeFunctionData(name, data);
}

/**
 * Decodes the arguments of an encoded ERC-20 call.
 *
 * @param name - The ERC-20 function that was encoded.
 * @param data - The encoded calldata.
 * @returns The decoded arguments.
 */
function decodeErc20Call(
  name: 'approve' | 'transfer',
  data: Hex | undefined,
): Result {
  if (!data) {
    throw new Error(`Expected ${name} calldata`);
  }
  return ERC20_INTERFACE.decodeFunctionData(name, data);
}

/**
 * Points the vault contract reads at the local mocks. The builders construct
 * contracts by ABI, so the mock dispatches on which function the given ABI
 * declares.
 */
function mockVaultContracts(): void {
  jest.clearAllMocks();
  MockContract.mockImplementation(
    (_address: string, abi: unknown) =>
      (JSON.stringify(abi).includes('previewDeposit')
        ? { previewDeposit }
        : { getRate }) as unknown as Contract,
  );
}

describe('applySlippage', () => {
  it('applies 0.2% slippage to a round value', () => {
    expect(applySlippage(BigInt(1000))).toBe(BigInt(998));
  });

  it('applies 0.2% slippage with integer truncation', () => {
    expect(applySlippage(BigInt(1))).toBe(BigInt(0));
  });

  it('applies 0.2% slippage to a large value', () => {
    const amount = BigInt('1000000000000000000');
    expect(applySlippage(amount)).toBe((amount * BigInt(998)) / BigInt(1000));
  });

  it('returns 0 for 0 input', () => {
    expect(applySlippage(BigInt(0))).toBe(BigInt(0));
  });
});

describe('getSharesForWithdrawal', () => {
  const SHARE_SCALAR = BigInt(1_000_000);

  it('converts amount to shares at 1:1 rate (exact division)', () => {
    expect(getSharesForWithdrawal(BigInt(1_000_000), BigInt(1_000_000))).toBe(
      BigInt(1_000_000),
    );
  });

  it('scales down when rate is higher than 1:1 (exact division)', () => {
    expect(getSharesForWithdrawal(BigInt(1_000_000), BigInt(2_000_000))).toBe(
      BigInt(500_000),
    );
  });

  it('scales up when rate is lower than 1:1 (exact division)', () => {
    expect(getSharesForWithdrawal(BigInt(2_000_000), BigInt(1_000_000))).toBe(
      BigInt(2_000_000),
    );
  });

  it('uses ceiling division — rounds up when remainder exists', () => {
    // floor(1_000_000 * 1_000_000 / 3_000_000) = 333_333, so ceiling is 333_334.
    const amount = BigInt(1_000_000);
    const rate = BigInt(3_000_000);
    expect((amount * SHARE_SCALAR) / rate).toBe(BigInt(333_333));
    expect(getSharesForWithdrawal(amount, rate)).toBe(BigInt(333_334));
  });

  it('reproduces the exact reported scenario — $1.96 at rate ~1,000,094', () => {
    // This was the failing case: floor division gave 1,959,815 shares, and the
    // contract's mulDivDown produced 1,959,999 assetsOut < 1,960,000
    // minimumAssets.
    const amount = BigInt(1_960_000); // $1.96 in 6 decimals
    const rate = BigInt(1_000_094);

    expect((amount * SHARE_SCALAR) / rate).toBe(BigInt(1_959_815)); // old buggy value

    const ceilShares = getSharesForWithdrawal(amount, rate);
    expect(ceilShares).toBe(BigInt(1_959_816)); // fixed: one more share

    // Verify: contract mulDivDown(ceilShares * rate / SCALAR) >= amount
    expect((ceilShares * rate) / SHARE_SCALAR).toBeGreaterThanOrEqual(amount);
  });

  it('reproduces the reported $1.00 scenario — was passing by luck', () => {
    const amount = BigInt(1_000_000);
    const rate = BigInt(1_000_094);

    const floorShares = (amount * SHARE_SCALAR) / rate;
    const ceilShares = getSharesForWithdrawal(amount, rate);

    expect(ceilShares).toBeGreaterThanOrEqual(floorShares);
    expect((ceilShares * rate) / SHARE_SCALAR).toBeGreaterThanOrEqual(amount);
  });

  it('handles large amounts with ceiling division', () => {
    const amount = BigInt('1000000000000'); // $1M in 6 decimals
    const rate = BigInt('1500000');
    const result = getSharesForWithdrawal(amount, rate);
    const floorResult = (amount * SHARE_SCALAR) / rate;

    expect(result).toBeGreaterThanOrEqual(floorResult);
    // And at most one more than floor.
    expect(result - floorResult).toBeLessThanOrEqual(BigInt(1));
  });

  it('ceiling division equals floor when division is exact', () => {
    const amount = BigInt(2_000_000);
    const rate = BigInt(500_000);
    expect(getSharesForWithdrawal(amount, rate)).toBe(
      (amount * SHARE_SCALAR) / rate,
    );
  });

  it('returns 0 for zero amount', () => {
    expect(getSharesForWithdrawal(BigInt(0), BigInt(1_000_000))).toBe(
      BigInt(0),
    );
  });

  it('guarantees assetsOut >= amount across rates near 1:1', () => {
    const amount = BigInt(1_960_000);
    for (let rawRate = 999_900; rawRate <= 1_000_200; rawRate++) {
      const rate = BigInt(rawRate);
      const shares = getSharesForWithdrawal(amount, rate);
      // Simulate the contract's mulDivDown.
      expect((shares * rate) / SHARE_SCALAR).toBeGreaterThanOrEqual(amount);
    }
  });
});

describe('getMoneyAccountDepositAssetAddress', () => {
  it('returns the mUSD address for a chain mUSD is deployed on', () => {
    expect(getMoneyAccountDepositAssetAddress(CHAIN_ID)).toBe(
      MUSD_TOKEN_ADDRESS,
    );
  });

  it('throws for a chain mUSD is not deployed on', () => {
    expect(() =>
      getMoneyAccountDepositAssetAddress(UNSUPPORTED_CHAIN_ID),
    ).toThrow(`mUSD not deployed on chain ${UNSUPPORTED_CHAIN_ID}`);
  });
});

describe('getMoneyAccountDepositAssetId', () => {
  it('returns the mapped asset id for a known chain', () => {
    expect(getMoneyAccountDepositAssetId(CHAIN_IDS.MONAD)).toBe(
      MUSD_TOKEN_ASSET_ID_BY_CHAIN[CHAIN_IDS.MONAD],
    );
    expect(getMoneyAccountDepositAssetId(CHAIN_IDS.MAINNET)).toBe(
      MUSD_TOKEN_ASSET_ID_BY_CHAIN[CHAIN_IDS.MAINNET],
    );
  });

  it('returns undefined for a chain mUSD is not deployed on', () => {
    expect(getMoneyAccountDepositAssetId(UNSUPPORTED_CHAIN_ID)).toBeUndefined();
  });

  it('returns undefined when chainId is undefined', () => {
    expect(getMoneyAccountDepositAssetId(undefined)).toBeUndefined();
  });
});

describe('buildMoneyAccountDepositBatch', () => {
  beforeEach(mockVaultContracts);

  it('returns approve and deposit transactions with the expected targets and types', async () => {
    previewDeposit.mockResolvedValue(BigInt(1_000_000));

    const result = await buildMoneyAccountDepositBatch(depositArgs());

    expect(result.approveTx.type).toBe(TransactionType.tokenMethodApprove);
    expect(result.approveTx.params.to).toBe(MUSD_TOKEN_ADDRESS);
    expect(result.approveTx.params.value).toBe('0x0');

    expect(result.depositTx.type).toBe(TransactionType.moneyAccountDeposit);
    expect(result.depositTx.params.to).toBe(TELLER);
    expect(result.depositTx.params.value).toBe('0x0');
  });

  it('encodes an approval of the deposit amount for the boring vault', async () => {
    previewDeposit.mockResolvedValue(BigInt(1_000_000));

    const result = await buildMoneyAccountDepositBatch(
      depositArgs({ amount: BigInt(500_000) }),
    );

    const decoded = decodeErc20Call('approve', result.approveTx.params.data);
    expectSameAddress(decoded.spender, BORING_VAULT);
    expect(BigInt(decoded.amount.toString())).toBe(BigInt(500_000));
  });

  it('calls previewDeposit with the deposit asset, amount and vault addresses', async () => {
    previewDeposit.mockResolvedValue(BigInt(500_000));

    await buildMoneyAccountDepositBatch(depositArgs());

    expect(previewDeposit).toHaveBeenCalledWith(
      MUSD_TOKEN_ADDRESS,
      '1000000',
      BORING_VAULT,
      ACCOUNTANT,
    );
  });

  it('derives minimumMint from the previewed shares less slippage', async () => {
    const shares = BigInt(1_000_000);
    previewDeposit.mockResolvedValue(shares);

    const result = await buildMoneyAccountDepositBatch(depositArgs());

    const decoded = decodeTellerCall('deposit', result.depositTx.params.data);
    expectSameAddress(decoded.depositAsset, MUSD_TOKEN_ADDRESS);
    expect(BigInt(decoded.depositAmount.toString())).toBe(BigInt(1_000_000));
    expect(BigInt(decoded.minimumMint.toString())).toBe(applySlippage(shares));
    expectSameAddress(decoded.referralAddress, ZERO_ADDRESS);
  });

  it('skips the previewDeposit read and mints nothing for a zero amount', async () => {
    const result = await buildMoneyAccountDepositBatch(
      depositArgs({ amount: BigInt(0) }),
    );

    expect(previewDeposit).not.toHaveBeenCalled();
    const decoded = decodeTellerCall('deposit', result.depositTx.params.data);
    expect(BigInt(decoded.minimumMint.toString())).toBe(BigInt(0));
  });

  it('throws for a chain mUSD is not deployed on', async () => {
    await expect(
      buildMoneyAccountDepositBatch(
        depositArgs({ chainId: UNSUPPORTED_CHAIN_ID }),
      ),
    ).rejects.toThrow(`mUSD not deployed on chain ${UNSUPPORTED_CHAIN_ID}`);
  });

  it('propagates previewDeposit failures', async () => {
    previewDeposit.mockRejectedValue(new Error('RPC down'));

    await expect(buildMoneyAccountDepositBatch(depositArgs())).rejects.toThrow(
      'RPC down',
    );
  });
});

describe('buildMoneyAccountDepositPlaceholderBatch', () => {
  beforeEach(mockVaultContracts);

  it('returns the approve and deposit targets and types without calldata', () => {
    const result = buildMoneyAccountDepositPlaceholderBatch({
      chainId: CHAIN_ID,
      tellerAddress: TELLER,
    });

    expect(result.approveTx.type).toBe(TransactionType.tokenMethodApprove);
    expect(result.approveTx.params.to).toBe(MUSD_TOKEN_ADDRESS);
    expect(result.approveTx.params.value).toBe('0x0');
    expect(result.approveTx.params).not.toHaveProperty('data');

    expect(result.depositTx.type).toBe(TransactionType.moneyAccountDeposit);
    expect(result.depositTx.params.to).toBe(TELLER);
    expect(result.depositTx.params.value).toBe('0x0');
    expect(result.depositTx.params).not.toHaveProperty('data');
  });

  it('performs no vault reads', () => {
    buildMoneyAccountDepositPlaceholderBatch({
      chainId: CHAIN_ID,
      tellerAddress: TELLER,
    });

    expect(previewDeposit).not.toHaveBeenCalled();
    expect(MockContract).not.toHaveBeenCalled();
  });

  it('throws for a chain mUSD is not deployed on', () => {
    expect(() =>
      buildMoneyAccountDepositPlaceholderBatch({
        chainId: UNSUPPORTED_CHAIN_ID,
        tellerAddress: TELLER,
      }),
    ).toThrow(`mUSD not deployed on chain ${UNSUPPORTED_CHAIN_ID}`);
  });
});

describe('buildMoneyAccountWithdrawBatch', () => {
  beforeEach(mockVaultContracts);

  it('returns withdraw and transfer transactions with the expected targets and types', async () => {
    getRate.mockResolvedValue(BigInt(1_000_000));

    const result = await buildMoneyAccountWithdrawBatch(withdrawArgs());

    expect(result.withdrawTx.type).toBe(TransactionType.moneyAccountWithdraw);
    expect(result.withdrawTx.params.to).toBe(TELLER);
    expect(result.withdrawTx.params.value).toBe('0x0');

    // The transfer targets the mUSD token contract, not the recipient.
    expect(result.transferTx.type).toBe(TransactionType.tokenMethodTransfer);
    expect(result.transferTx.params.to).toBe(MUSD_TOKEN_ADDRESS);
    expect(result.transferTx.params.value).toBe('0x0');
  });

  it('redeems shares to the money account and transfers the amount to the recipient', async () => {
    getRate.mockResolvedValue(BigInt(1_000_000));

    const result = await buildMoneyAccountWithdrawBatch(withdrawArgs());

    const withdraw = decodeTellerCall(
      'withdraw',
      result.withdrawTx.params.data,
    );
    expectSameAddress(withdraw.withdrawAsset, MUSD_TOKEN_ADDRESS);
    expectSameAddress(withdraw.to, MONEY_ACCOUNT_ADDRESS);

    const transfer = decodeErc20Call('transfer', result.transferTx.params.data);
    expectSameAddress(transfer.to, RECIPIENT_ADDRESS);
    expect(BigInt(transfer.amount.toString())).toBe(BigInt(1_000_000));
  });

  it('reads the vault rate once', async () => {
    getRate.mockResolvedValue(BigInt(2_000_000));

    await buildMoneyAccountWithdrawBatch(withdrawArgs());

    expect(getRate).toHaveBeenCalledTimes(1);
  });

  it('skips the rate read for a zero amount (placeholder batch)', async () => {
    const result = await buildMoneyAccountWithdrawBatch(
      withdrawArgs({ amount: BigInt(0) }),
    );

    expect(getRate).not.toHaveBeenCalled();
    const decoded = decodeTellerCall('withdraw', result.withdrawTx.params.data);
    expect(BigInt(decoded.shareAmount.toString())).toBe(BigInt(0));
    expect(BigInt(decoded.minimumAssets.toString())).toBe(BigInt(0));
  });

  it('encodes minimumAssets as amount - 1 for defense-in-depth', async () => {
    getRate.mockResolvedValue(BigInt(1_000_000));
    const amount = BigInt(1_960_000);

    const result = await buildMoneyAccountWithdrawBatch(
      withdrawArgs({ amount }),
    );

    const decoded = decodeTellerCall('withdraw', result.withdrawTx.params.data);
    expect(BigInt(decoded.minimumAssets.toString())).toBe(amount - BigInt(1));
  });

  it('uses ceiling division for shareAmount in withdraw calldata', async () => {
    // A rate that produces a remainder, to verify ceiling division.
    getRate.mockResolvedValue(BigInt(1_000_094));

    const result = await buildMoneyAccountWithdrawBatch(
      withdrawArgs({ amount: BigInt(1_960_000) }),
    );

    const decoded = decodeTellerCall('withdraw', result.withdrawTx.params.data);
    // Ceiling: (1_960_000 * 1_000_000 + 1_000_094 - 1) / 1_000_094 = 1_959_816.
    // Floor division would give 1_959_815.
    expect(BigInt(decoded.shareAmount.toString())).toBe(BigInt(1_959_816));
  });

  it('throws for a chain mUSD is not deployed on', async () => {
    await expect(
      buildMoneyAccountWithdrawBatch(
        withdrawArgs({ chainId: UNSUPPORTED_CHAIN_ID }),
      ),
    ).rejects.toThrow(`mUSD not deployed on chain ${UNSUPPORTED_CHAIN_ID}`);
  });

  it('propagates getRate failures', async () => {
    getRate.mockRejectedValue(new Error('RPC down'));

    await expect(
      buildMoneyAccountWithdrawBatch(withdrawArgs()),
    ).rejects.toThrow('RPC down');
  });
});
