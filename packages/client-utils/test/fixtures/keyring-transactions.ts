import {
  BtcScope,
  SolScope,
  TransactionStatus,
  TransactionType,
} from '@metamask/keyring-api';

import { CustomTransactionTypeLabel } from '../../src/mappers/keyring-transaction-mapper';

const accountId = '00000000-0000-4000-8000-000000000000';
const stellarUsdcAsset = `stellar:pubnet/asset:USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`;

export const keyringTransactionFixtures = {
  addresses: {
    fromAddress: 'from-address',
    toAddress: 'to-address',
    meAddress: 'me-address',
    ownerAddress: 'owner-address',
    spenderAddress: 'spender-address',
    senderAddress: 'sender-address',
    bitcoinSubject: 'bc1qcj8v4ft5uvt59jjrxd856a48xegclwne78h0ye',
    bitcoinOutput: 'bc1qc5tzsfpd3zjecma6529kanjtug69rf58mtfxmu',
  },
  constants: {
    uint256Max:
      '115792089237316195423570985008687907853269984665640564039457584007913129639935',
  },
  mapArgs: {
    sendWithToken: {
      transaction: {
        id: 'send-id',
        chain: SolScope.Mainnet,
        account: accountId,
        status: TransactionStatus.Confirmed,
        timestamp: 1716367781,
        type: TransactionType.Send,
        from: [
          {
            address: 'from-address',
            asset: {
              fungible: true,
              type: `${SolScope.Mainnet}/token:usdc`,
              unit: 'USDC',
              amount: '2.5',
            },
          },
        ],
        to: [{ address: 'to-address', asset: null }],
        fees: [],
        events: [],
      } as never,
    },
    swap: {
      transaction: {
        id: 'swap-id',
        chain: SolScope.Mainnet,
        account: accountId,
        status: TransactionStatus.Submitted,
        timestamp: 1716367781,
        type: TransactionType.Swap,
        from: [
          {
            address: 'from-address',
            asset: {
              fungible: true,
              type: `${SolScope.Mainnet}/slip44:501`,
              unit: 'SOL',
              amount: '1',
            },
          },
        ],
        to: [
          {
            address: 'to-address',
            asset: {
              fungible: true,
              type: `${SolScope.Mainnet}/token:usdc`,
              unit: 'USDC',
              amount: '100',
            },
          },
        ],
        fees: [],
        events: [],
      } as never,
    },
    receive: {
      subjectAddress: 'me-address',
      transaction: {
        id: 'receive-id',
        chain: SolScope.Mainnet,
        account: accountId,
        status: TransactionStatus.Confirmed,
        timestamp: 1716367781,
        type: TransactionType.Receive,
        from: [{ address: 'sender-address', asset: null }],
        to: [
          {
            address: 'me-address',
            asset: {
              fungible: true,
              type: `${SolScope.Mainnet}/token:usdc`,
              unit: 'USDC',
              amount: '7',
            },
          },
        ],
        fees: [],
        events: [],
      } as never,
    },
    unknownContractInteraction: {
      transaction: {
        id: 'unknown-id',
        chain: SolScope.Mainnet,
        account: accountId,
        status: TransactionStatus.Failed,
        timestamp: 1716367781,
        type: TransactionType.Unknown,
        from: [{ address: 'from-address', asset: null }],
        to: [{ address: 'to-address', asset: null }],
        fees: [
          {
            type: 'base',
            asset: {
              fungible: true,
              type: `${SolScope.Mainnet}/slip44:501`,
              unit: 'SOL',
              amount: '0.0001',
            },
          },
        ],
        events: [],
      } as never,
    },
    approveFifteenDigits: {
      transaction: {
        id: 'approve-id',
        chain: SolScope.Mainnet,
        account: accountId,
        status: TransactionStatus.Confirmed,
        timestamp: 1716367781,
        type: TransactionType.TokenApprove,
        from: [
          {
            address: 'owner-address',
            asset: {
              fungible: true,
              type: `${SolScope.Mainnet}/token:usdc`,
              unit: 'USDC',
              amount: '999999999999999',
            },
          },
        ],
        to: [{ address: 'spender-address', asset: null }],
        fees: [],
        events: [],
      } as never,
    },
    approveUint256Max: {
      transaction: {
        id: 'unlimited-approve-id',
        chain: SolScope.Mainnet,
        account: accountId,
        status: TransactionStatus.Confirmed,
        timestamp: 1716367781,
        type: TransactionType.TokenApprove,
        from: [
          {
            address: 'owner-address',
            asset: {
              fungible: true,
              type: `${SolScope.Mainnet}/token:usdc`,
              unit: 'USDC',
              amount:
                '115792089237316195423570985008687907853269984665640564039457584007913129639935',
            },
          },
        ],
        to: [{ address: 'spender-address', asset: null }],
        fees: [],
        events: [],
      } as never,
    },
    approveNoAmount: {
      transaction: {
        id: 'approve-no-amount-id',
        chain: SolScope.Mainnet,
        account: accountId,
        status: TransactionStatus.Confirmed,
        timestamp: 1716367781,
        type: TransactionType.TokenApprove,
        from: [{ address: 'owner-address', asset: null }],
        to: [{ address: 'spender-address', asset: null }],
        fees: [],
        events: [],
      } as never,
    },
    approveSixteenDigits: {
      transaction: {
        id: 'boundary-approve-id',
        chain: SolScope.Mainnet,
        account: accountId,
        status: TransactionStatus.Confirmed,
        timestamp: 1716367781,
        type: TransactionType.TokenApprove,
        from: [
          {
            address: 'owner-address',
            asset: {
              fungible: true,
              type: `${SolScope.Mainnet}/token:usdc`,
              unit: 'USDC',
              amount: '1000000000000000',
            },
          },
        ],
        to: [{ address: 'spender-address', asset: null }],
        fees: [],
        events: [],
      } as never,
    },
    emptyMovements: {
      transaction: {
        id: 'empty-movements-id',
        chain: SolScope.Mainnet,
        account: accountId,
        status: TransactionStatus.Confirmed,
        timestamp: 1716367781,
        type: TransactionType.Unknown,
        from: [],
        to: [],
        fees: [],
        events: [],
      } as never,
    },
    noTimestamp: {
      transaction: {
        id: 'no-timestamp-id',
        chain: SolScope.Mainnet,
        account: accountId,
        status: TransactionStatus.Confirmed,
        timestamp: null,
        type: TransactionType.Send,
        from: [{ address: 'from-address', asset: null }],
        to: [{ address: 'to-address', asset: null }],
        fees: [],
        events: [],
      } as never,
    },
    nonFungibleFee: {
      transaction: {
        id: 'nonfungible-fee-id',
        chain: SolScope.Mainnet,
        account: accountId,
        status: TransactionStatus.Confirmed,
        timestamp: 1716367781,
        type: TransactionType.Send,
        from: [{ address: 'from-address', asset: null }],
        to: [{ address: 'to-address', asset: null }],
        fees: [
          {
            type: 'base',
            asset: { fungible: false, id: `${SolScope.Mainnet}/nft:1` },
          },
        ],
        events: [],
      } as never,
    },
    bitcoinSend: {
      subjectAddress: 'bc1qcj8v4ft5uvt59jjrxd856a48xegclwne78h0ye',
      transaction: {
        id: '9a2098cdeb6dcd2d89b9d8993b5f5b2d97a49f91b63aba0ae6d525e6532a64b6',
        chain: BtcScope.Mainnet,
        account: accountId,
        status: TransactionStatus.Confirmed,
        timestamp: 1716367781,
        type: TransactionType.Send,
        from: [],
        to: [
          {
            address: 'bc1qc5tzsfpd3zjecma6529kanjtug69rf58mtfxmu',
            asset: {
              fungible: true,
              type: `${BtcScope.Mainnet}/slip44:0`,
              unit: 'BTC',
              amount: '0.000003',
            },
          },
        ],
        fees: [],
        events: [],
      } as never,
    },
    trustlineApprove: {
      transaction: {
        id: 'trustline-approve-id',
        chain: 'stellar:pubnet',
        account: accountId,
        status: TransactionStatus.Confirmed,
        timestamp: 1716367781,
        type: TransactionType.TokenApprove,
        details: {
          typeLabel: CustomTransactionTypeLabel.TrustlineApprove,
        },
        from: [
          {
            address: 'owner-address',
            asset: {
              fungible: true,
              type: stellarUsdcAsset,
              unit: 'USDC',
              amount: '0',
            },
          },
        ],
        to: [{ address: 'issuer-address', asset: null }],
        fees: [],
        events: [],
      } as never,
    },
    trustlineApproveNoAmount: {
      transaction: {
        id: 'trustline-approve-no-amount-id',
        chain: 'stellar:pubnet',
        account: accountId,
        status: TransactionStatus.Confirmed,
        timestamp: 1716367781,
        type: TransactionType.TokenApprove,
        details: {
          typeLabel: CustomTransactionTypeLabel.TrustlineApprove,
        },
        from: [{ address: 'owner-address', asset: null }],
        to: [{ address: 'issuer-address', asset: null }],
        fees: [],
        events: [],
      } as never,
    },
    trustlineDisapprove: {
      transaction: {
        id: 'trustline-disapprove-id',
        chain: 'stellar:pubnet',
        account: accountId,
        status: TransactionStatus.Confirmed,
        timestamp: 1716367781,
        type: TransactionType.TokenDisapprove,
        details: {
          typeLabel: CustomTransactionTypeLabel.TrustlineDisapprove,
        },
        from: [
          {
            address: 'owner-address',
            asset: {
              fungible: true,
              type: stellarUsdcAsset,
              unit: 'USDC',
              amount: '0',
            },
          },
        ],
        to: [{ address: 'issuer-address', asset: null }],
        fees: [],
        events: [],
      } as never,
    },
    trustlineDisapproveNoAmount: {
      transaction: {
        id: 'trustline-disapprove-no-amount-id',
        chain: 'stellar:pubnet',
        account: accountId,
        status: TransactionStatus.Confirmed,
        timestamp: 1716367781,
        type: TransactionType.TokenDisapprove,
        details: {
          typeLabel: CustomTransactionTypeLabel.TrustlineDisapprove,
        },
        from: [{ address: 'owner-address', asset: null }],
        to: [{ address: 'issuer-address', asset: null }],
        fees: [],
        events: [],
      } as never,
    },
    disapproveNonTrustline: {
      transaction: {
        id: 'plain-disapprove-id',
        chain: SolScope.Mainnet,
        account: accountId,
        status: TransactionStatus.Confirmed,
        timestamp: 1716367781,
        type: TransactionType.TokenDisapprove,
        from: [{ address: 'owner-address', asset: null }],
        to: [{ address: 'spender-address', asset: null }],
        fees: [],
        events: [],
      } as never,
    },
  },
};
