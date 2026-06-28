import { defaultAbiCoder } from '@ethersproject/abi';
import type { Hex } from '@metamask/utils';

import { getMessengerMock } from '../../../tests/messenger-mock';
import {
  buildAndSignSubsidizedDelegation,
  DELEGATION_MANAGER_ADDRESS,
  ERC20_BALANCE_CHANGE_ENFORCER_ADDRESS,
  LIMITED_CALLS_ENFORCER_ADDRESS,
  SUBSIDIZED_AMOUNT_BUFFER_BPS,
} from './delegation';

const FROM_MOCK = '0x1234567890123456789012345678901234567890' as Hex;
const SOURCE_TOKEN_MOCK =
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Hex;
const SOURCE_CHAIN_ID_MOCK = '0x1' as Hex;
const SOURCE_AMOUNT_RAW_MOCK = '1000000';
const SIGNATURE_MOCK = `0x${'00'.repeat(65)}` as Hex;

describe('delegation', () => {
  const { messenger, signTypedMessageMock } = getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();
    signTypedMessageMock.mockResolvedValue(SIGNATURE_MOCK);
  });

  describe('buildAndSignSubsidizedDelegation', () => {
    it('calls KeyringController:signTypedMessage with correct EIP-712 params', async () => {
      await buildAndSignSubsidizedDelegation({
        from: FROM_MOCK,
        sourceChainId: SOURCE_CHAIN_ID_MOCK,
        sourceTokenAddress: SOURCE_TOKEN_MOCK,
        sourceAmountRaw: SOURCE_AMOUNT_RAW_MOCK,
        messenger,
      });

      expect(signTypedMessageMock).toHaveBeenCalledTimes(1);
      expect(signTypedMessageMock).toHaveBeenCalledWith(
        { from: FROM_MOCK, data: expect.any(String) },
        'V4',
      );

      const typedData = JSON.parse(
        signTypedMessageMock.mock.calls[0][0].data as string,
      );

      expect(typedData.primaryType).toBe('Delegation');
      expect(typedData.domain.verifyingContract).toBe(DELEGATION_MANAGER_ADDRESS);
      expect(typedData.domain.chainId).toBe(1);
      expect(typedData.domain.name).toBe('DelegationManager');
      expect(typedData.domain.version).toBe('1');
      expect(typedData.message.delegator).toBe(FROM_MOCK);
      expect(typedData.message.delegate).toBe(
        '0x0000000000000000000000000000000000000a11',
      );
      expect(typedData.message.authority).toBe(
        '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      );
      expect(typedData.message.caveats).toHaveLength(2);
    });

    it('includes ERC20BalanceChangeEnforcer caveat with 20% buffered amount', async () => {
      await buildAndSignSubsidizedDelegation({
        from: FROM_MOCK,
        sourceChainId: SOURCE_CHAIN_ID_MOCK,
        sourceTokenAddress: SOURCE_TOKEN_MOCK,
        sourceAmountRaw: SOURCE_AMOUNT_RAW_MOCK,
        messenger,
      });

      const typedData = JSON.parse(
        signTypedMessageMock.mock.calls[0][0].data as string,
      );
      const erc20Caveat = typedData.message.caveats[0];

      expect(erc20Caveat.enforcer).toBe(ERC20_BALANCE_CHANGE_ENFORCER_ADDRESS);

      // 1000000 * 1.20 = 1200000 = 0x124f80; padded to 32 bytes at end of packed terms
      expect(erc20Caveat.terms).toContain(
        '0000000000000000000000000000000000000000000000000000000000124f80',
      );
    });

    it('encodes ERC20BalanceChange caveat terms with token and recipient from params', async () => {
      await buildAndSignSubsidizedDelegation({
        from: FROM_MOCK,
        sourceChainId: SOURCE_CHAIN_ID_MOCK,
        sourceTokenAddress: SOURCE_TOKEN_MOCK,
        sourceAmountRaw: SOURCE_AMOUNT_RAW_MOCK,
        messenger,
      });

      const typedData = JSON.parse(
        signTypedMessageMock.mock.calls[0][0].data as string,
      );
      const erc20Terms: string = typedData.message.caveats[0].terms;

      // Packed: bool(true)=01, token=SOURCE_TOKEN_MOCK (20 bytes), recipient=FROM_MOCK (20 bytes), amount (32 bytes)
      expect(erc20Terms.startsWith('0x01')).toBe(true);
      expect(erc20Terms.toLowerCase()).toContain(
        SOURCE_TOKEN_MOCK.replace('0x', '').toLowerCase(),
      );
      expect(erc20Terms.toLowerCase()).toContain(
        FROM_MOCK.replace('0x', '').toLowerCase(),
      );
    });

    it('includes LimitedCallsEnforcer caveat with count of 1', async () => {
      await buildAndSignSubsidizedDelegation({
        from: FROM_MOCK,
        sourceChainId: SOURCE_CHAIN_ID_MOCK,
        sourceTokenAddress: SOURCE_TOKEN_MOCK,
        sourceAmountRaw: SOURCE_AMOUNT_RAW_MOCK,
        messenger,
      });

      const typedData = JSON.parse(
        signTypedMessageMock.mock.calls[0][0].data as string,
      );
      const limitedCaveat = typedData.message.caveats[1];

      expect(limitedCaveat.enforcer).toBe(LIMITED_CALLS_ENFORCER_ADDRESS);
      expect(limitedCaveat.terms).toBe(
        defaultAbiCoder.encode(['uint256'], [1]),
      );
    });

    it('uses ceiling rounding when amount buffer produces a fractional result', async () => {
      // 7 * 1.20 = 8.4 → ceil → 9
      await buildAndSignSubsidizedDelegation({
        from: FROM_MOCK,
        sourceChainId: SOURCE_CHAIN_ID_MOCK,
        sourceTokenAddress: SOURCE_TOKEN_MOCK,
        sourceAmountRaw: '7',
        messenger,
      });

      const typedData = JSON.parse(
        signTypedMessageMock.mock.calls[0][0].data as string,
      );
      const erc20Terms: string = typedData.message.caveats[0].terms;

      // 9 = 0x09, padded to 32 bytes at end of packed terms
      expect(erc20Terms).toContain(
        '0000000000000000000000000000000000000000000000000000000000000009',
      );
    });

    it('returns a 0x-prefixed ABI-encoded permission context', async () => {
      const result = await buildAndSignSubsidizedDelegation({
        from: FROM_MOCK,
        sourceChainId: SOURCE_CHAIN_ID_MOCK,
        sourceTokenAddress: SOURCE_TOKEN_MOCK,
        sourceAmountRaw: SOURCE_AMOUNT_RAW_MOCK,
        messenger,
      });

      expect(result.startsWith('0x')).toBe(true);
      // ABI-encoded Delegation[] is at least 32 bytes (just the offset pointer)
      expect(result.length).toBeGreaterThan(66);
    });

    it('salt in EIP-712 message is serializable as decimal string', async () => {
      await buildAndSignSubsidizedDelegation({
        from: FROM_MOCK,
        sourceChainId: SOURCE_CHAIN_ID_MOCK,
        sourceTokenAddress: SOURCE_TOKEN_MOCK,
        sourceAmountRaw: SOURCE_AMOUNT_RAW_MOCK,
        messenger,
      });

      const rawData = signTypedMessageMock.mock.calls[0][0].data as string;
      // JSON.stringify must not have thrown; we can safely re-parse
      const typedData = JSON.parse(rawData);
      expect(typeof typedData.message.salt).toBe('string');
      expect(Number.isFinite(Number(typedData.message.salt))).toBe(true);
    });

    it('uses the chain ID from sourceChainId (hex to decimal)', async () => {
      await buildAndSignSubsidizedDelegation({
        from: FROM_MOCK,
        sourceChainId: '0xa' as Hex, // chain 10 (Optimism)
        sourceTokenAddress: SOURCE_TOKEN_MOCK,
        sourceAmountRaw: SOURCE_AMOUNT_RAW_MOCK,
        messenger,
      });

      const typedData = JSON.parse(
        signTypedMessageMock.mock.calls[0][0].data as string,
      );

      expect(typedData.domain.chainId).toBe(10);
    });
  });

  describe('constants', () => {
    it('SUBSIDIZED_AMOUNT_BUFFER_BPS is 2000 (20%)', () => {
      expect(SUBSIDIZED_AMOUNT_BUFFER_BPS).toBe(2000);
    });

    it('DELEGATION_MANAGER_ADDRESS is the expected v1.3.0 address', () => {
      expect(DELEGATION_MANAGER_ADDRESS).toBe(
        '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3',
      );
    });

    it('ERC20_BALANCE_CHANGE_ENFORCER_ADDRESS is the expected v1.3.0 address', () => {
      expect(ERC20_BALANCE_CHANGE_ENFORCER_ADDRESS).toBe(
        '0xcdF6aB796408598Cea671d79506d7D48E97a5437',
      );
    });

    it('LIMITED_CALLS_ENFORCER_ADDRESS is the expected v1.3.0 address', () => {
      expect(LIMITED_CALLS_ENFORCER_ADDRESS).toBe(
        '0x04658B29F6b82ed55274221a06Fc97D318E25416',
      );
    });
  });
});
