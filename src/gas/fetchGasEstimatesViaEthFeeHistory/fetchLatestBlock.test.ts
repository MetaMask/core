import { BN } from 'ethereumjs-util';
import { mocked } from 'ts-jest/utils';
import { when } from 'jest-when';
import { query } from '../../util';
import { buildFakeEthQuery } from '../../../tests/util';
import fetchLatestBlock from './fetchLatestBlock';

jest.mock('../../util', () => {
  return {
    ...jest.requireActual('../../util'),
    query: jest.fn(),
  };
});

const mockedQuery = mocked(query, true);

describe('fetchLatestBlock', () => {
  const ethQuery = buildFakeEthQuery();

  it('returns an object that represents the latest block on the network, where number and baseFeePerGas are BN objects instead of hex strings', async () => {
    when(mockedQuery)
      .calledWith(ethQuery, 'blockNumber')
      .mockResolvedValue('0x1');

    when(mockedQuery)
      .calledWith(ethQuery, 'getBlockByNumber', ['0x1', false])
      .mockResolvedValue({
        number: '0x2',
        baseFeePerGas: '0x3',
      });

    const latestBlock = await fetchLatestBlock(ethQuery);

    expect(latestBlock).toStrictEqual({
      number: new BN(2),
      baseFeePerGas: new BN(3),
    });
  });

  it('passes includeFullTransactionData to the getBlockByNumber query', async () => {
    when(mockedQuery)
      .calledWith(ethQuery, 'blockNumber')
      .mockResolvedValue('0x1');

    when(mockedQuery)
      .calledWith(ethQuery, 'getBlockByNumber', ['0x1', true])
      .mockResolvedValue({
        number: '0x2',
        baseFeePerGas: '0x3',
      });

    const latestBlock = await fetchLatestBlock(ethQuery, true);

    expect(latestBlock).toStrictEqual({
      number: new BN(2),
      baseFeePerGas: new BN(3),
    });
  });
});
