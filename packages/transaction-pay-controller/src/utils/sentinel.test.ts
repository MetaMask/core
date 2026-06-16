import type { Hex } from '@metamask/utils';

import { SentinelSimulationError, simulateTransactions } from './sentinel';

const CHAIN_ID_MOCK = '0x1' as Hex;
const CHAIN_ID_UNSUPPORTED_MOCK = '0x999' as Hex;
const NETWORK_SUBDOMAIN_MOCK = 'ethereum-mainnet';
const SIMULATION_URL_MOCK = `https://tx-sentinel-${NETWORK_SUBDOMAIN_MOCK}.api.cx.metamask.io/`;

const NETWORKS_RESPONSE_MOCK = {
  '1': { confirmations: true, network: NETWORK_SUBDOMAIN_MOCK },
};

function buildFetchMock(
  networksBody: unknown,
  simulationBody: unknown,
): jest.Mock {
  return jest
    .fn()
    .mockResolvedValueOnce({
      json: () => Promise.resolve(networksBody),
    })
    .mockResolvedValueOnce({
      json: () => Promise.resolve(simulationBody),
    });
}

describe('Sentinel', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('simulateTransactions', () => {
    it('fetches network list then posts simulation and returns result', async () => {
      const transactionsMock = [{ error: undefined }];

      fetchMock = buildFetchMock(NETWORKS_RESPONSE_MOCK, {
        result: { transactions: transactionsMock },
      });
      global.fetch = fetchMock;

      const result = await simulateTransactions(CHAIN_ID_MOCK, {
        transactions: [
          { from: '0x1111111111111111111111111111111111111111' as Hex },
        ],
      });

      expect(result).toStrictEqual({ transactions: transactionsMock });

      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'https://tx-sentinel-ethereum-mainnet.api.cx.metamask.io/networks',
      );

      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        SIMULATION_URL_MOCK,
        expect.objectContaining({ method: 'POST' }),
      );

      const body = JSON.parse(
        (fetchMock.mock.calls[1][1] as { body: string }).body,
      );

      expect(body).toStrictEqual({
        id: '0',
        jsonrpc: '2.0',
        method: 'infura_simulateTransactions',
        params: [
          {
            transactions: [
              { from: '0x1111111111111111111111111111111111111111' },
            ],
          },
        ],
      });
    });

    it('throws SentinelSimulationError when response contains error', async () => {
      fetchMock = buildFetchMock(NETWORKS_RESPONSE_MOCK, {
        error: { code: -32000, message: 'Internal server error' },
      });
      global.fetch = fetchMock;

      await expect(
        simulateTransactions(CHAIN_ID_MOCK, { transactions: [] }),
      ).rejects.toMatchObject({
        name: 'SentinelSimulationError',
        message: 'Internal server error',
        code: -32000,
      });
    });

    it('throws SentinelSimulationError when chain is not in network data', async () => {
      fetchMock = jest.fn().mockResolvedValueOnce({
        json: () => Promise.resolve({}),
      });
      global.fetch = fetchMock;

      await expect(
        simulateTransactions(CHAIN_ID_UNSUPPORTED_MOCK, { transactions: [] }),
      ).rejects.toMatchObject({
        name: 'SentinelSimulationError',
        message: `Simulation is not supported for chain ${CHAIN_ID_UNSUPPORTED_MOCK}`,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('throws SentinelSimulationError when network has no confirmations flag', async () => {
      fetchMock = jest.fn().mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            '2471': { network: 'some-network' },
          }),
      });
      global.fetch = fetchMock;

      await expect(
        simulateTransactions('0x9a7' as Hex, { transactions: [] }),
      ).rejects.toMatchObject({
        name: 'SentinelSimulationError',
        message: 'Simulation is not supported for chain 0x9a7',
      });
    });

    it('passes optional simulation fields through to the request body', async () => {
      fetchMock = buildFetchMock(NETWORKS_RESPONSE_MOCK, {
        result: { transactions: [] },
      });
      global.fetch = fetchMock;

      const overrides = {
        ['0xaaaa' as Hex]: { code: '0xbbbb' as Hex },
      };

      await simulateTransactions(CHAIN_ID_MOCK, {
        overrides,
        transactions: [],
        withCallTrace: true,
        withGas: true,
        withLogs: true,
      });

      const body = JSON.parse(
        (fetchMock.mock.calls[1][1] as { body: string }).body,
      );

      expect(body.params[0]).toStrictEqual({
        overrides,
        transactions: [],
        withCallTrace: true,
        withGas: true,
        withLogs: true,
      });
    });
  });

  describe('SentinelSimulationError', () => {
    it('preserves name, message, and optional code', () => {
      const error = new SentinelSimulationError('boom', 42);

      expect(error.name).toBe('SentinelSimulationError');
      expect(error.message).toBe('boom');
      expect(error.code).toBe(42);
    });

    it('allows code to be omitted', () => {
      const error = new SentinelSimulationError('no code');

      expect(error.code).toBeUndefined();
    });
  });
});
