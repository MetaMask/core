import { testsForRpcMethodSupportingBlockParam } from '../../../tests/network-client/block-param';
import { NetworkClientType } from '../../types';

describe('createNetworkClient - methods included in the Ethereum JSON-RPC spec - methods that have a param to specify the block', () => {
  for (const networkClientType of [
    NetworkClientType.Infura,
    NetworkClientType.Custom,
  ]) {
    const supportingBlockParam = [
      {
        name: 'eth_call',
        blockParamIndex: 1,
        numberOfParameters: 2,
      },
      {
        name: 'eth_getBalance',
        blockParamIndex: 1,
        numberOfParameters: 2,
      },
      {
        name: 'eth_getBlockByNumber',
        blockParamIndex: 0,
        numberOfParameters: 2,
      },
      { name: 'eth_getCode', blockParamIndex: 1, numberOfParameters: 2 },
      {
        name: 'eth_getStorageAt',
        blockParamIndex: 2,
        numberOfParameters: 3,
      },
      {
        name: 'eth_getTransactionCount',
        blockParamIndex: 1,
        numberOfParameters: 2,
      },
    ];
    supportingBlockParam.forEach(
      ({ name, blockParamIndex, numberOfParameters }) => {
        describe(`method name: ${name}`, () => {
          testsForRpcMethodSupportingBlockParam(name, {
            providerType: networkClientType,
            blockParamIndex,
            numberOfParameters,
          });
        });
      },
    );
  }
});
