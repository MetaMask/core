import type {
  V1TransactionByHashResponse,
  V5TransactionRecord,
  V5TransactionValueTransfer,
} from '@metamask/core-backend';
import type { CaipAssetType, CaipChainId } from '@metamask/utils';
import {
  isCaipAccountId,
  isCaipAssetType,
  isCaipChainId,
} from '@metamask/utils';

import { getFees } from '../../src/mappers/helpers/transactions.js';

type V1ValueTransfer = NonNullable<
  V1TransactionByHashResponse['valueTransfers']
>[number] & { tokenId?: string };

const contractTokenTransferTypes = new Set(['erc20', 'erc721', 'erc1155']);

function toCaipAssetType(
  chainId: CaipChainId,
  assetNamespace: string,
  assetReference: string,
): CaipAssetType | undefined {
  const assetId = `${chainId}/${assetNamespace}:${assetReference}`;
  return isCaipAssetType(assetId) ? assetId : undefined;
}

function toV5ValueTransfer(
  transfer: V1ValueTransfer,
  chainId: CaipChainId,
): V5TransactionValueTransfer | undefined {
  const { transferType, contractAddress } = transfer;
  let assetId: CaipAssetType | undefined;
  let assetClass = 'ft';

  if (contractTokenTransferTypes.has(transferType)) {
    if (!contractAddress) {
      return undefined;
    }
    assetId = toCaipAssetType(chainId, transferType, contractAddress);
    assetClass = transferType === 'erc20' ? 'ft' : 'nft';
  } else if (transferType === 'normal' || transferType === 'internal') {
    assetId = toCaipAssetType(chainId, 'slip44', '60');
    if (transferType === 'internal') {
      assetClass = 'eip155Internal';
    }
  } else {
    return undefined;
  }

  if (!assetId) {
    return undefined;
  }

  return {
    assetClass,
    assetId,
    from: transfer.from,
    to: transfer.to,
    ...(transfer.amount === undefined
      ? {}
      : { amount: String(transfer.amount) }),
    ...(transfer.decimal === undefined ? {} : { decimal: transfer.decimal }),
    ...(transfer.symbol === undefined ? {} : { symbol: transfer.symbol }),
    ...(transfer.name === undefined ? {} : { name: transfer.name }),
    ...(transfer.tokenId === undefined ? {} : { tokenId: transfer.tokenId }),
  };
}

// Returns undefined for V1 fixtures with no v5 equivalent: a transfer without
// a type, or a token transfer without a contract address.
export function toV5TransactionRecord(
  transaction: V1TransactionByHashResponse,
  subjectAddress: string,
): V5TransactionRecord | undefined {
  const chainId = `eip155:${transaction.chainId}`;
  if (!isCaipChainId(chainId)) {
    return undefined;
  }

  const accountId = `${chainId}:${subjectAddress}`;
  if (!isCaipAccountId(accountId)) {
    return undefined;
  }

  const valueTransfers = (transaction.valueTransfers ?? []).map((transfer) =>
    toV5ValueTransfer(transfer, chainId),
  );

  if (valueTransfers.some((transfer) => transfer === undefined)) {
    return undefined;
  }

  const [fee] = getFees(transaction) ?? [];
  const payer = `${chainId}:${transaction.from}`;

  return {
    accountId,
    tx: {
      id: transaction.hash,
      chainId,
      status: transaction.isError ? 'failed' : 'confirmed',
      timestamp: new Date(transaction.timestamp).getTime(),
      date: transaction.timestamp,
      from: transaction.from,
      to: transaction.to,
      blockNumber: String(transaction.blockNumber),
      blockHash: transaction.blockHash,
      value: transaction.value,
      methodId: transaction.methodId,
      transactionType: transaction.transactionType,
      transactionCategory: transaction.transactionCategory,
      transactionProtocol: transaction.transactionProtocol,
    },
    valueTransfers: valueTransfers as V5TransactionValueTransfer[],
    fee:
      fee?.amount &&
      fee.assetId &&
      isCaipAssetType(fee.assetId) &&
      isCaipAccountId(payer)
        ? {
            payer,
            asset: {
              assetId: fee.assetId,
              amount: fee.amount,
              decimals: fee.decimals ?? 18,
              symbol: fee.symbol,
            },
          }
        : null,
  };
}

const subjectAccountId = 'eip155:1:0x020ca66c30bec2c4fe3861a94e4db4a498a35872';

const ethFee = {
  payer: subjectAccountId,
  asset: {
    assetId: 'eip155:1/slip44:60',
    amount: '15400436779165',
    decimals: 18,
    symbol: 'ETH',
  },
  unitsConsumed: 324061,
  unitPrice: '47523265',
};

// Rows captured from `GET /v5/multiaccount/transactions` with
// `includeTxMetadata=true`, trimmed to the fields the mapper reads.
const records = {
  nftExchangeWethProceeds: {
    accountId: subjectAccountId,
    tx: {
      id: '0x5df2653e0c78854a0579650d8b9877a2bb5c8346e8ba26ff2e632e4e4a6c8df9',
      chainId: 'eip155:1',
      status: 'confirmed',
      timestamp: 1793753903000,
      date: '2026-11-04T00:58:23.000Z',
      from: '0x020ca66c30bec2c4fe3861a94e4db4a498a35872',
      to: '0x0000000000000068f116a894984e2db1123eb395',
      blockNumber: '26338011',
      blockHash:
        '0xb2efc899573bd10006083f0893afbfa2709d51b2d249922f987a42b6e244e0a7',
      nonce: '20283',
      value: '0',
      methodId: '0xf2d12b12',
      transactionType: 'OPENSEA_V1.6_NFT_EXCHANGE',
      transactionCategory: 'NFT_EXCHANGE',
      transactionProtocol: 'OPENSEA',
      readable: 'Exchanged NFT',
      readableExtended: 'Exchanged NFT',
    },
    valueTransfers: [
      {
        assetClass: 'ft',
        from: '0x6647e27bb65ee8fd21ce0d6876c3139edf0b70bc',
        to: '0x020ca66c30bec2c4fe3861a94e4db4a498a35872',
        assetId: 'eip155:1/erc20:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        amount: '5395500000000000000',
        decimal: 18,
        symbol: 'WETH',
        name: 'Wrapped Ether',
      },
    ],
    fee: ethFee,
  },
  standardReceiveWithNullMethodId: {
    accountId: subjectAccountId,
    tx: {
      id: '0x72ce13fb5f85c42abb1b9197b4b8b9d467915b570a875715179701ee01594acf',
      chainId: 'eip155:1',
      status: 'confirmed',
      timestamp: 1793745131000,
      date: '2026-11-03T22:32:11.000Z',
      from: '0xceb69f6342ece283b2f5c9088ff249b5d0ae66ea',
      to: '0x020ca66c30bec2c4fe3861a94e4db4a498a35872',
      blockNumber: '26337285',
      blockHash:
        '0x5496182b3a222b6c66b005190647db6e2f14900a16db549d95b33399553a21f0',
      nonce: '142920',
      value: '25000000000000000000',
      transactionType: 'STANDARD',
      transactionCategory: 'STANDARD',
      readable: 'Received ETH',
      readableExtended: 'Received 25 ETH',
    },
    valueTransfers: [
      {
        assetClass: 'ft',
        from: '0xceb69f6342ece283b2f5c9088ff249b5d0ae66ea',
        to: '0x020ca66c30bec2c4fe3861a94e4db4a498a35872',
        assetId: 'eip155:1/slip44:60',
        amount: '25000000000000000000',
        decimal: 18,
        symbol: 'ETH',
        name: 'Ether',
      },
    ],
    fee: {
      ...ethFee,
      payer: 'eip155:1:0xceb69f6342ece283b2f5c9088ff249b5d0ae66ea',
    },
  },
  internalNativeReceive: {
    accountId: subjectAccountId,
    tx: {
      id: '0x425bfbf09d2625ad42f221fd981c8f45159a2582676fe169e75b11e5073c498b',
      chainId: 'eip155:1',
      status: 'confirmed',
      timestamp: 1793766587000,
      date: '2026-11-04T04:29:47.000Z',
      from: '0xa0172521dbe64d42cff2f5da06b2822becf2bcc4',
      to: '0x0000000000000068f116a894984e2db1123eb395',
      blockNumber: '26339065',
      blockHash:
        '0xfeb2f0d8339c2b83088feab1bb72e6c3a491c96371476f310ce619a08231b3f2',
      value: '6000000000000000000',
      methodId: '0x00000000',
      transactionType: 'OPENSEA_V1.6_TRANSFER',
      transactionCategory: 'TRANSFER',
      transactionProtocol: 'OPENSEA',
    },
    valueTransfers: [
      {
        assetClass: 'eip155Internal',
        from: '0x0000000000000068f116a894984e2db1123eb395',
        to: '0x020ca66c30bec2c4fe3861a94e4db4a498a35872',
        assetId: 'eip155:1/slip44:60',
        amount: '5940000000000000000',
        decimal: 18,
        symbol: 'ETH',
        name: 'Ether',
      },
    ],
    fee: null,
  },
  contractDeployment: {
    accountId: subjectAccountId,
    tx: {
      id: '0xcontractdeployment',
      chainId: 'eip155:1',
      status: 'failed',
      timestamp: 1793745131000,
      date: '2026-11-03T22:32:11.000Z',
      from: '0x020ca66c30bec2c4fe3861a94e4db4a498a35872',
      to: null,
      blockNumber: '26337285',
      blockHash: '0xblock',
      transactionCategory: 'CONTRACT_CALL',
    },
    valueTransfers: [],
    fee: ethFee,
  },
  stellarPayment: {
    accountId: 'stellar:pubnet:GABCSUBJECT',
    tx: {
      id: '8d0fstellarpayment',
      chainId: 'stellar:pubnet',
      status: 'confirmed',
      timestamp: 1714440000000,
      date: '2024-04-30T01:20:00.000Z',
      from: 'GABCSUBJECT',
      to: 'GDEFRECIPIENT',
      blockNumber: '50123456',
      blockHash: '0xabc',
      transactionCategory: 'TRANSFER',
    },
    valueTransfers: [
      {
        assetClass: 'ft',
        from: 'GABCSUBJECT',
        to: 'GDEFRECIPIENT',
        assetId: 'stellar:pubnet/slip44:148',
        amount: '10000000',
        decimal: 7,
        symbol: 'XLM',
        name: 'Stellar Lumens',
      },
    ],
    fee: {
      payer: 'stellar:pubnet:GABCSUBJECT',
      asset: {
        assetId: 'stellar:pubnet/slip44:148',
        amount: '100',
        decimals: 7,
        symbol: 'XLM',
      },
      stroops: 100,
    },
  },
  stellarTokenReceive: {
    accountId: 'stellar:pubnet:GABCSUBJECT',
    tx: {
      id: '8d0fstellartoken',
      chainId: 'stellar:pubnet',
      status: 'pending',
      timestamp: 1714440000000,
      date: '2024-04-30T01:20:00.000Z',
      from: 'GDEFSENDER',
      to: 'GABCSUBJECT',
      blockNumber: '50123456',
      blockHash: '0xabc',
      transactionCategory: 'TRANSFER',
    },
    valueTransfers: [
      {
        assetClass: 'ft',
        from: 'GDEFSENDER',
        to: 'GABCSUBJECT',
        assetId:
          'stellar:pubnet/asset:USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
        amount: '5000000',
        decimal: 7,
        symbol: 'USDC',
      },
    ],
    fee: {
      payer: 'stellar:pubnet:GDEFSENDER',
      asset: {
        assetId: 'stellar:pubnet/slip44:148',
        amount: '100',
        decimals: 7,
      },
    },
  },
} as const satisfies Record<string, V5TransactionRecord>;

export const v5ApiTransactionFixtures = { records };
