import { Interface } from '@ethersproject/abi';
import { Contract } from '@ethersproject/contracts';
import type { Provider } from '@ethersproject/providers';
import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import {
  applySlippage,
  buildMoneyAccountDepositBatch,
  buildMoneyAccountWithdrawBatch,
  getMoneyAccountDepositAssetAddress,
  getSharesForWithdrawal,
  TELLER_ABI,
} from './moneyAccountTransactions';
import { MUSD_TOKEN_ADDRESS } from './musd';

const mockPreviewDeposit = jest.fn();
const mockGetRate = jest.fn();

jest.mock('@ethersproject/contracts');

// Monad — a chain where mUSD is deployed, so the real address map resolves.
const MOCK_CHAIN_ID = '0x8f' as Hex;
const MOCK_BORING_VAULT = '0xB5F07d769dD60fE54c97dd53101181073DDf21b2' as Hex;
const MOCK_TELLER = '0x86821F179eaD9F0b3C79b2f8deF0227eEBFDc9f9' as Hex;
const MOCK_ACCOUNTANT = '0x800ebc3B74F67EaC27C9CCE4E4FF28b17CdCA173' as Hex;
const MOCK_LENS = '0x846a7832022350434B5cC006d07cc9c782469660' as Hex;
const MOCK_MONEY_ACCOUNT_ADDRESS =
  '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as Hex;
const MOCK_RECIPIENT_ADDRESS =
  '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex;
const MOCK_PROVIDER = {} as Provider;

const decodeWithdraw = (
  data: Hex,
): ReturnType<Interface['decodeFunctionData']> =>
  new Interface(TELLER_ABI).decodeFunctionData('withdraw', data);

/**
 * (Re)install the Contract fake. `resetMocks` wipes module-mock
 * implementations before each test, so this runs in a `beforeEach` inside the
 * describes that build calldata, rather than in the mock factory.
 */
function installContractFake(): void {
  jest.mocked(Contract).mockImplementation(
    (_address, abi): Contract =>
      ({
        previewDeposit: mockPreviewDeposit,
        getRate: mockGetRate,
        // Sanity marker so a wrong-ABI lookup fails loudly in tests.
        abi,
      }) as unknown as Contract,
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
    const expected = (amount * BigInt(998)) / BigInt(1000);
    expect(applySlippage(amount)).toBe(expected);
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
    // 1_000_000 * 1_000_000 = 1_000_000_000_000
    // floor(1_000_000_000_000 / 3_000_000) = 333_333; ceiling = 333_334
    const amount = BigInt(1_000_000);
    const rate = BigInt(3_000_000);
    expect((amount * SHARE_SCALAR) / rate).toBe(BigInt(333_333));
    expect(getSharesForWithdrawal(amount, rate)).toBe(BigInt(333_334));
  });

  it('reproduces the exact reported scenario — $1.96 at rate ~1,000,094', () => {
    // This was the failing case: floor division gave 1,959,815 shares,
    // contract mulDivDown produced 1,959,999 assetsOut < 1,960,000 minimumAssets
    const amount = BigInt(1_960_000); // $1.96 in 6 decimals
    const rate = BigInt(1_000_094);

    const floorShares = (amount * SHARE_SCALAR) / rate;
    expect(floorShares).toBe(BigInt(1_959_815)); // old buggy value

    const ceilShares = getSharesForWithdrawal(amount, rate);
    expect(ceilShares).toBe(BigInt(1_959_816)); // fixed: one more share

    // Verify: contract mulDivDown(ceilShares * rate / SCALAR) >= amount
    const assetsOut = (ceilShares * rate) / SHARE_SCALAR;
    expect(assetsOut).toBeGreaterThanOrEqual(amount);
  });

  it('reproduces the reported $1.00 scenario — was passing by luck', () => {
    const amount = BigInt(1_000_000);
    const rate = BigInt(1_000_094);

    const floorShares = (amount * SHARE_SCALAR) / rate;
    const ceilShares = getSharesForWithdrawal(amount, rate);

    // With ceiling, we get at least as many shares as floor
    expect(ceilShares).toBeGreaterThanOrEqual(floorShares);

    // Contract-side check still passes
    const assetsOut = (ceilShares * rate) / SHARE_SCALAR;
    expect(assetsOut).toBeGreaterThanOrEqual(amount);
  });

  it('handles large amounts with ceiling division', () => {
    const amount = BigInt('1000000000000'); // $1M in 6 decimals
    const rate = BigInt('1500000');
    const result = getSharesForWithdrawal(amount, rate);
    const floorResult = (amount * SHARE_SCALAR) / rate;
    // Ceiling >= floor always
    expect(result).toBeGreaterThanOrEqual(floorResult);
    // And at most 1 more than floor
    expect(result - floorResult).toBeLessThanOrEqual(1n);
  });

  it('ceiling division equals floor when division is exact', () => {
    // 2_000_000 * 1_000_000 / 500_000 = 4_000_000_000 (exact)
    const amount = BigInt(2_000_000);
    const rate = BigInt(500_000);
    const floorResult = (amount * SHARE_SCALAR) / rate;
    expect(getSharesForWithdrawal(amount, rate)).toBe(floorResult);
  });

  it('returns 0 for zero amount', () => {
    expect(getSharesForWithdrawal(0n, BigInt(1_000_000))).toBe(0n);
  });

  it('guarantees assetsOut >= amount for many rate values', () => {
    // Fuzz-like: sweep a range of rates near 1:1
    const amount = BigInt(1_960_000);
    for (let rawRate = 999_900; rawRate <= 1_000_200; rawRate++) {
      const rate = BigInt(rawRate);
      const shares = getSharesForWithdrawal(amount, rate);
      // Simulate contract mulDivDown
      const assetsOut = (shares * rate) / SHARE_SCALAR;
      expect(assetsOut).toBeGreaterThanOrEqual(amount);
    }
  });
});

describe('getMoneyAccountDepositAssetAddress', () => {
  it('returns the mUSD address for a chain where mUSD is deployed', () => {
    expect(getMoneyAccountDepositAssetAddress(MOCK_CHAIN_ID)).toBe(
      MUSD_TOKEN_ADDRESS,
    );
  });

  it('throws for a chain where mUSD is not deployed', () => {
    expect(() => getMoneyAccountDepositAssetAddress('0x89' as Hex)).toThrow(
      'mUSD not deployed on chain 0x89',
    );
  });
});

describe('buildMoneyAccountDepositBatch', () => {
  beforeEach(installContractFake);

  const buildDeposit = (
    amount: bigint,
  ): ReturnType<typeof buildMoneyAccountDepositBatch> =>
    buildMoneyAccountDepositBatch({
      amount,
      chainId: MOCK_CHAIN_ID,
      boringVault: MOCK_BORING_VAULT,
      tellerAddress: MOCK_TELLER,
      accountantAddress: MOCK_ACCOUNTANT,
      lensAddress: MOCK_LENS,
      provider: MOCK_PROVIDER,
    });

  it('returns approve and deposit transactions with correct types', async () => {
    mockPreviewDeposit.mockResolvedValue('1000000');

    const result = await buildDeposit(BigInt(1_000_000));

    expect(result.approveTx.type).toBe(TransactionType.tokenMethodApprove);
    expect(result.approveTx.params.to).toBe(MUSD_TOKEN_ADDRESS);
    expect(result.approveTx.params.value).toBe('0x0');

    expect(result.depositTx.type).toBe(TransactionType.moneyAccountDeposit);
    expect(result.depositTx.params.to).toBe(MOCK_TELLER);
    expect(result.depositTx.params.value).toBe('0x0');
  });

  it('encodes approve data targeting the boring vault', async () => {
    mockPreviewDeposit.mockResolvedValue('1000000');

    const result = await buildDeposit(BigInt(500_000));

    const decoded = new Interface([
      'function approve(address spender, uint256 amount)',
    ]).decodeFunctionData('approve', result.approveTx.params.data);
    expect(decoded.spender.toLowerCase()).toBe(MOCK_BORING_VAULT.toLowerCase());
    expect(BigInt(decoded.amount.toString())).toBe(BigInt(500_000));
  });

  it('calls previewDeposit with correct arguments and applies slippage to minimumMint', async () => {
    mockPreviewDeposit.mockResolvedValue('1000000');

    const result = await buildDeposit(BigInt(1_000_000));

    expect(mockPreviewDeposit).toHaveBeenCalledWith(
      MUSD_TOKEN_ADDRESS,
      '1000000',
      MOCK_BORING_VAULT,
      MOCK_ACCOUNTANT,
    );

    const decoded = new Interface(TELLER_ABI).decodeFunctionData(
      'deposit',
      result.depositTx.params.data,
    );
    // 0.2% slippage on the previewed 1_000_000 shares.
    expect(BigInt(decoded.minimumMint.toString())).toBe(BigInt(998_000));
  });

  it('skips the preview call and encodes minimumMint 0 for a zero-amount placeholder batch', async () => {
    const result = await buildDeposit(0n);

    expect(mockPreviewDeposit).not.toHaveBeenCalled();

    const decoded = new Interface(TELLER_ABI).decodeFunctionData(
      'deposit',
      result.depositTx.params.data,
    );
    expect(BigInt(decoded.minimumMint.toString())).toBe(0n);
  });
});

describe('buildMoneyAccountWithdrawBatch', () => {
  beforeEach(installContractFake);

  const buildWithdraw = (
    amount: bigint,
  ): ReturnType<typeof buildMoneyAccountWithdrawBatch> =>
    buildMoneyAccountWithdrawBatch({
      amount,
      chainId: MOCK_CHAIN_ID,
      tellerAddress: MOCK_TELLER,
      accountantAddress: MOCK_ACCOUNTANT,
      moneyAccountAddress: MOCK_MONEY_ACCOUNT_ADDRESS,
      recipient: MOCK_RECIPIENT_ADDRESS,
      provider: MOCK_PROVIDER,
    });

  it('returns withdrawTx and transferTx with correct transaction types', async () => {
    mockGetRate.mockResolvedValue('1000000');

    const result = await buildWithdraw(BigInt(1_000_000));

    expect(result.withdrawTx.type).toBe(TransactionType.moneyAccountWithdraw);
    expect(result.withdrawTx.params.to).toBe(MOCK_TELLER);
    expect(result.withdrawTx.params.value).toBe('0x0');

    expect(result.transferTx.type).toBe(TransactionType.tokenMethodTransfer);
    expect(result.transferTx.params.value).toBe('0x0');
  });

  it('targets the token contract (not the recipient) with the transfer', async () => {
    mockGetRate.mockResolvedValue('1000000');

    const result = await buildWithdraw(BigInt(1_000_000));

    expect(result.transferTx.params.to).toBe(MUSD_TOKEN_ADDRESS);
    expect(result.transferTx.params.to).not.toBe(MOCK_RECIPIENT_ADDRESS);
  });

  it('encodes the recipient and amount in the transfer calldata', async () => {
    mockGetRate.mockResolvedValue('1000000');

    const result = await buildWithdraw(BigInt(1_000_000));

    const decoded = new Interface([
      'function transfer(address to, uint256 amount)',
    ]).decodeFunctionData('transfer', result.transferTx.params.data);
    expect(decoded.to.toLowerCase()).toBe(MOCK_RECIPIENT_ADDRESS.toLowerCase());
    expect(BigInt(decoded.amount.toString())).toBe(BigInt(1_000_000));
  });

  it('calls getRate on the accountant contract', async () => {
    mockGetRate.mockResolvedValue('2000000');

    await buildWithdraw(BigInt(1_000_000));

    expect(mockGetRate).toHaveBeenCalledTimes(1);
  });

  it('skips getRate when amount is 0 (placeholder batch)', async () => {
    const result = await buildWithdraw(BigInt(0));

    expect(mockGetRate).not.toHaveBeenCalled();
    expect(result.withdrawTx.params.data.startsWith('0x')).toBe(true);
    expect(result.transferTx.params.data.startsWith('0x')).toBe(true);
  });

  it('encodes minimumAssets as amount - 1 for defense-in-depth', async () => {
    mockGetRate.mockResolvedValue('1000000');

    const amount = BigInt(1_960_000);
    const result = await buildWithdraw(amount);

    const decoded = decodeWithdraw(result.withdrawTx.params.data);
    expect(BigInt(decoded.minimumAssets.toString())).toBe(amount - 1n);
    expect(decoded.to.toLowerCase()).toBe(
      MOCK_MONEY_ACCOUNT_ADDRESS.toLowerCase(),
    );
  });

  it('encodes minimumAssets and shareAmount as 0 when amount is 0 (placeholder batch)', async () => {
    const result = await buildWithdraw(BigInt(0));

    const decoded = decodeWithdraw(result.withdrawTx.params.data);
    expect(BigInt(decoded.minimumAssets.toString())).toBe(0n);
    expect(BigInt(decoded.shareAmount.toString())).toBe(0n);
  });

  it('uses ceiling division for shareAmount in withdraw calldata', async () => {
    // A rate that produces a remainder, to verify ceiling division.
    mockGetRate.mockResolvedValue('1000094');

    const amount = BigInt(1_960_000);
    const result = await buildWithdraw(amount);

    const decoded = decodeWithdraw(result.withdrawTx.params.data);
    expect(BigInt(decoded.shareAmount.toString())).toBe(
      getSharesForWithdrawal(amount, BigInt(1_000_094)),
    );
  });
});
