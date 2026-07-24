import { SolScope } from '@metamask/keyring-api';

import { keyringTransactionFixtures } from '../../test/fixtures/keyring-transactions.js';
import { mapKeyringTransaction } from './keyring-transaction-mapper.js';

describe('mapKeyringTransaction', () => {
  it('maps keyring send transactions with token amount data', () => {
    const item = mapKeyringTransaction(
      keyringTransactionFixtures.mapArgs.sendWithToken,
    );

    expect(item).toMatchObject({
      type: 'send',
      chainId: SolScope.Mainnet,
      status: 'success',
      timestamp: 1716367781000,
      hash: 'send-id',
      data: {
        from: 'from-address',
        to: 'to-address',
        token: {
          amount: '2.5',
          assetId: `${SolScope.Mainnet}/token:usdc`,
          direction: 'out',
          symbol: 'USDC',
        },
      },
    });
  });

  it('maps keyring swap transactions with source and destination token amounts', () => {
    const item = mapKeyringTransaction(keyringTransactionFixtures.mapArgs.swap);

    expect(item).toMatchObject({
      type: 'swap',
      chainId: SolScope.Mainnet,
      status: 'pending',
      timestamp: 1716367781000,
      hash: 'swap-id',
      data: {
        sourceToken: {
          amount: '1',
          assetId: `${SolScope.Mainnet}/slip44:501`,
          direction: 'out',
          symbol: 'SOL',
        },
        destinationToken: {
          amount: '100',
          assetId: `${SolScope.Mainnet}/token:usdc`,
          direction: 'in',
          symbol: 'USDC',
        },
      },
    });
  });

  it('maps a keyring receive transaction to a receive activity item', () => {
    const item = mapKeyringTransaction(
      keyringTransactionFixtures.mapArgs.receive,
    );

    expect(item).toMatchObject({
      type: 'receive',
      chainId: SolScope.Mainnet,
      status: 'success',
      hash: 'receive-id',
      data: {
        from: 'sender-address',
        to: 'me-address',
        token: {
          amount: '7',
          direction: 'in',
          symbol: 'USDC',
        },
      },
    });
  });

  it('maps an unknown keyring transaction type to a contract interaction', () => {
    const item = mapKeyringTransaction(
      keyringTransactionFixtures.mapArgs.unknownContractInteraction,
    );

    expect(item).toMatchObject({
      type: 'contractInteraction',
      chainId: SolScope.Mainnet,
      status: 'failed',
      hash: 'unknown-id',
      data: {
        from: 'from-address',
        to: 'to-address',
        fees: [
          {
            type: 'base',
            amount: '0.0001',
            symbol: 'SOL',
            assetId: `${SolScope.Mainnet}/slip44:501`,
          },
        ],
      },
    });
  });

  it('maps token approve with amount ≤15 digits to approveSpendingCap preserving the amount', () => {
    const item = mapKeyringTransaction(
      keyringTransactionFixtures.mapArgs.approveFifteenDigits,
    );

    expect(item).toMatchObject({
      type: 'approveSpendingCap',
      chainId: SolScope.Mainnet,
      status: 'success',
      timestamp: 1716367781000,
      hash: 'approve-id',
      data: {
        from: 'owner-address',
        token: {
          amount: '999999999999999',
          assetId: `${SolScope.Mainnet}/token:usdc`,
          direction: 'out',
          symbol: 'USDC',
        },
      },
    });
  });

  it('strips token amount for approve with >15 digit integer part (uint256.max)', () => {
    const item = mapKeyringTransaction(
      keyringTransactionFixtures.mapArgs.approveUint256Max,
    );

    expect(item).toMatchObject({
      type: 'approveSpendingCap',
      hash: 'unlimited-approve-id',
      data: {
        token: {
          assetId: `${SolScope.Mainnet}/token:usdc`,
          symbol: 'USDC',
          direction: 'out',
          amount: undefined,
        },
      },
    });
  });

  it('returns the approve token unchanged when no amount is present', () => {
    const item = mapKeyringTransaction(
      keyringTransactionFixtures.mapArgs.approveNoAmount,
    );

    expect(item).toMatchObject({
      type: 'approveSpendingCap',
      data: { from: 'owner-address', token: undefined },
    });
  });

  it('strips token amount when integer part has exactly 16 digits (boundary)', () => {
    const item = mapKeyringTransaction(
      keyringTransactionFixtures.mapArgs.approveSixteenDigits,
    );

    expect(item).toMatchObject({
      type: 'approveSpendingCap',
      data: {
        token: {
          amount: undefined,
        },
      },
    });
  });

  it('falls back to an empty address when a movement list is empty', () => {
    const item = mapKeyringTransaction(
      keyringTransactionFixtures.mapArgs.emptyMovements,
    );

    expect(item).toMatchObject({
      type: 'contractInteraction',
      data: { from: '', to: '' },
    });
  });

  it('maps a missing timestamp to a zero timestamp', () => {
    const item = mapKeyringTransaction(
      keyringTransactionFixtures.mapArgs.noTimestamp,
    );

    expect(item.timestamp).toBe(0);
  });

  it('skips non-fungible fees', () => {
    const item = mapKeyringTransaction(
      keyringTransactionFixtures.mapArgs.nonFungibleFee,
    );

    expect(item).toMatchObject({ type: 'send', data: { fees: [] } });
  });

  it('maps bitcoin send from account address and to output address', () => {
    const item = mapKeyringTransaction(
      keyringTransactionFixtures.mapArgs.bitcoinSend,
    );

    expect(item).toMatchObject({
      type: 'send',
      data: {
        from: 'bc1qcj8v4ft5uvt59jjrxd856a48xegclwne78h0ye',
        to: 'bc1qc5tzsfpd3zjecma6529kanjtug69rf58mtfxmu',
        token: {
          amount: '0.000003',
          direction: 'out',
          symbol: 'BTC',
        },
      },
    });
  });

  it('maps trustline approve TokenApprove to assetActivation', () => {
    const item = mapKeyringTransaction(
      keyringTransactionFixtures.mapArgs.trustlineApprove,
    );

    expect(item).toMatchObject({
      type: 'assetActivation',
      chainId: 'stellar:pubnet',
      status: 'success',
      timestamp: 1716367781000,
      hash: 'trustline-approve-id',
      data: {
        from: 'owner-address',
        token: {
          amount: undefined,
          symbol: 'USDC',
          direction: 'out',
        },
      },
    });
  });

  it('returns the trustline activation token unchanged when no amount is present', () => {
    const item = mapKeyringTransaction(
      keyringTransactionFixtures.mapArgs.trustlineApproveNoAmount,
    );

    expect(item).toMatchObject({
      type: 'assetActivation',
      data: { from: 'owner-address', token: undefined },
    });
  });

  it('maps trustline disapprove TokenDisapprove to assetDeactivation', () => {
    const item = mapKeyringTransaction(
      keyringTransactionFixtures.mapArgs.trustlineDisapprove,
    );

    expect(item).toMatchObject({
      type: 'assetDeactivation',
      chainId: 'stellar:pubnet',
      status: 'success',
      timestamp: 1716367781000,
      hash: 'trustline-disapprove-id',
      data: {
        from: 'owner-address',
        token: {
          amount: undefined,
          symbol: 'USDC',
          direction: 'out',
        },
      },
    });
  });

  it('returns the trustline deactivation token unchanged when no amount is present', () => {
    const item = mapKeyringTransaction(
      keyringTransactionFixtures.mapArgs.trustlineDisapproveNoAmount,
    );

    expect(item).toMatchObject({
      type: 'assetDeactivation',
      data: { from: 'owner-address', token: undefined },
    });
  });

  it('maps a non-trustline TokenDisapprove to a contract interaction', () => {
    const item = mapKeyringTransaction(
      keyringTransactionFixtures.mapArgs.disapproveNonTrustline,
    );

    expect(item).toMatchObject({
      type: 'contractInteraction',
      chainId: SolScope.Mainnet,
      data: {
        from: 'owner-address',
        to: 'spender-address',
      },
    });
  });
});
