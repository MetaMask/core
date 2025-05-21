import { SolScope } from '@metamask/keyring-api';
import { v4 as uuid } from 'uuid';

export const getMinimumBalanceForRentExemptionRequest = (snapId: string) => {
  return {
    snapId: snapId as never,
    origin: 'metamask',
    handler: 'onProtocolRequest' as never,
    request: {
      method: ' ',
      jsonrpc: '2.0',
      params: {
        scope: SolScope.Mainnet,
        request: {
          id: uuid(),
          jsonrpc: '2.0',
          method: 'getMinimumBalanceForRentExemption',
          params: [0, 'confirmed'],
        },
      },
    },
  };
};

export const getFeeForTransactionRequest = (
  snapId: string,
  transaction: string,
) => {
  return {
    snapId: snapId as never,
    origin: 'metamask',
    handler: 'onRpcRequest' as never,
    request: {
      method: 'getFeeForTransaction',
      params: {
        transaction,
        scope: SolScope.Mainnet,
      },
    },
  };
};
