import { stub } from 'sinon';
import nock from 'nock';
import { ControllerMessenger } from '../ControllerMessenger';
import {
  GasFeeController,
  GetGasFeeState,
  GasFeeStateChange,
  LegacyGasPriceEstimate,
} from './GasFeeController';

const TEST_GAS_FEE_API = 'https://mock-gas-server.herokuapp.com/<chain_id>';
const TEST_LEGACY_FEE_API = 'https://test/<chain_id>';

const name = 'GasFeeController';

/**
 * Constructs a restricted controller messenger.
 *
 * @returns A restricted controller messenger.
 */
function getRestrictedMessenger() {
  const controllerMessenger = new ControllerMessenger<
    GetGasFeeState,
    GasFeeStateChange
  >();
  const messenger = controllerMessenger.getRestricted<
    typeof name,
    never,
    never
  >({
    name,
  });
  return messenger;
}

describe('GasFeeController', () => {
  let gasFeeController: GasFeeController;
  let getCurrentNetworkLegacyGasAPICompatibility: jest.Mock<boolean>;
  let getIsEIP1559Compatible: jest.Mock<Promise<boolean>>;
  let getChainId: jest.Mock<`0x${string}` | `${number}` | number>;
  let mockGasFeeRequest: any;
  const mockRequestHandler = jest.fn();

  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    getChainId = jest.fn().mockImplementation(() => '0x1');
    getCurrentNetworkLegacyGasAPICompatibility = jest
      .fn()
      .mockImplementation(() => false);

    getIsEIP1559Compatible = jest
      .fn()
      .mockImplementation(() => Promise.resolve(true));

    mockGasFeeRequest = nock(TEST_GAS_FEE_API.replace('<chain_id>', '1'))
      .get(/.+/u)
      .reply(200, {
        low: {
          minWaitTimeEstimate: 60000,
          maxWaitTimeEstimate: 600000,
          suggestedMaxPriorityFeePerGas: '1',
          suggestedMaxFeePerGas: '35',
        },
        medium: {
          minWaitTimeEstimate: 15000,
          maxWaitTimeEstimate: 60000,
          suggestedMaxPriorityFeePerGas: '1.8',
          suggestedMaxFeePerGas: '38',
        },
        high: {
          minWaitTimeEstimate: 0,
          maxWaitTimeEstimate: 15000,
          suggestedMaxPriorityFeePerGas: '2',
          suggestedMaxFeePerGas: '50',
        },
        estimatedBaseFee: '28',
      })
      .persist();
    mockGasFeeRequest.on('request', mockRequestHandler);

    nock(TEST_LEGACY_FEE_API.replace('<chain_id>', '0x1'))
      .get(/.+/u)
      .reply(200, {
        SafeGasPrice: '22',
        ProposeGasPrice: '25',
        FastGasPrice: '30',
      })
      .persist();

    gasFeeController = new GasFeeController({
      interval: 10000,
      messenger: getRestrictedMessenger(),
      getProvider: () => stub(),
      getChainId,
      legacyAPIEndpoint: TEST_LEGACY_FEE_API,
      EIP1559APIEndpoint: TEST_GAS_FEE_API,
      onNetworkStateChange: () => stub(),
      getCurrentNetworkLegacyGasAPICompatibility,
      getCurrentNetworkEIP1559Compatibility: getIsEIP1559Compatible, // change this for networkController.state.properties.isEIP1559Compatible ???
    });
  });

  afterEach(() => {
    nock.cleanAll();
    jest.clearAllMocks();
    gasFeeController.destroy();
  });

  it('should initialize', async () => {
    expect(gasFeeController.name).toBe(name);
  });

  describe('getGasFeeEstimatesAndStartPolling', () => {
    it('should fetch estimates and start polling', async () => {
      expect(gasFeeController.state.gasFeeEstimates).toStrictEqual({});
      const result = await gasFeeController.getGasFeeEstimatesAndStartPolling(
        undefined,
      );
      expect(result).toHaveLength(36);
      expect(gasFeeController.state.gasFeeEstimates).toHaveProperty('low');
      expect(gasFeeController.state.gasFeeEstimates).toHaveProperty('medium');
      expect(gasFeeController.state.gasFeeEstimates).toHaveProperty('high');
      expect(gasFeeController.state.gasFeeEstimates).toHaveProperty(
        'estimatedBaseFee',
      );
    });

    it('should not fetch estimates if the controller is already polling, and should still return the passed token', async () => {
      const pollToken = 'token';

      const firstCallPromise = gasFeeController.getGasFeeEstimatesAndStartPolling(
        undefined,
      );
      const secondCallPromise = gasFeeController.getGasFeeEstimatesAndStartPolling(
        pollToken,
      );

      const result1 = await firstCallPromise;
      const result2 = await secondCallPromise;

      expect(mockRequestHandler).toHaveBeenCalledTimes(1);
      expect(result1).toHaveLength(36);
      expect(result2).toStrictEqual(pollToken);
    });

    it('should cause the fetching new estimates if called after the poll tokens are cleared, and then should not cause additional new fetches when subsequently called', async () => {
      const pollToken = 'token';

      const firstCallPromise = gasFeeController.getGasFeeEstimatesAndStartPolling(
        undefined,
      );
      const secondCallPromise = gasFeeController.getGasFeeEstimatesAndStartPolling(
        pollToken,
      );

      await firstCallPromise;
      await secondCallPromise;

      expect(mockRequestHandler).toHaveBeenCalledTimes(1);

      gasFeeController.stopPolling();

      const result3 = await gasFeeController.getGasFeeEstimatesAndStartPolling(
        undefined,
      );
      expect(result3).toHaveLength(36);
      expect(mockRequestHandler).toHaveBeenCalledTimes(2);

      const result4 = await gasFeeController.getGasFeeEstimatesAndStartPolling(
        undefined,
      );
      expect(result4).toHaveLength(36);
      expect(mockRequestHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('when on any network supporting legacy gas estimation api', () => {
    it('should _fetchGasFeeEstimateData', async () => {
      getCurrentNetworkLegacyGasAPICompatibility.mockImplementation(() => true);
      getIsEIP1559Compatible.mockImplementation(() => Promise.resolve(false));
      expect(gasFeeController.state.gasFeeEstimates).toStrictEqual({});
      const estimates = await gasFeeController._fetchGasFeeEstimateData();
      expect(estimates).toHaveProperty('gasFeeEstimates');
      expect(
        (gasFeeController.state.gasFeeEstimates as LegacyGasPriceEstimate).high,
      ).toBe('30');
    });
  });

  describe('getChainId', () => {
    it('should work with a number input', async () => {
      getChainId.mockImplementation(() => 1);
      getCurrentNetworkLegacyGasAPICompatibility.mockImplementation(() => true);
      getIsEIP1559Compatible.mockImplementation(() => Promise.resolve(false));
      expect(gasFeeController.state.gasFeeEstimates).toStrictEqual({});
      const estimates = await gasFeeController._fetchGasFeeEstimateData();
      expect(estimates).toHaveProperty('gasFeeEstimates');
      expect(
        (gasFeeController.state.gasFeeEstimates as LegacyGasPriceEstimate).high,
      ).toBe('30');
    });

    it('should work with a hexstring input', async () => {
      getChainId.mockImplementation(() => '0x1');
      getCurrentNetworkLegacyGasAPICompatibility.mockImplementation(() => true);
      getIsEIP1559Compatible.mockImplementation(() => Promise.resolve(false));
      expect(gasFeeController.state.gasFeeEstimates).toStrictEqual({});
      const estimates = await gasFeeController._fetchGasFeeEstimateData();
      expect(estimates).toHaveProperty('gasFeeEstimates');
      expect(
        (gasFeeController.state.gasFeeEstimates as LegacyGasPriceEstimate).high,
      ).toBe('30');
    });

    it('should work with a numeric string input', async () => {
      getChainId.mockImplementation(() => '1');
      getCurrentNetworkLegacyGasAPICompatibility.mockImplementation(() => true);
      getIsEIP1559Compatible.mockImplementation(() => Promise.resolve(false));
      expect(gasFeeController.state.gasFeeEstimates).toStrictEqual({});
      const estimates = await gasFeeController._fetchGasFeeEstimateData();
      expect(estimates).toHaveProperty('gasFeeEstimates');
      expect(
        (gasFeeController.state.gasFeeEstimates as LegacyGasPriceEstimate).high,
      ).toBe('30');
    });
  });

  describe('when on any network supporting EIP-1559', () => {
    it('should _fetchGasFeeEstimateData', async () => {
      getCurrentNetworkLegacyGasAPICompatibility.mockImplementation(() => true);
      expect(gasFeeController.state.gasFeeEstimates).toStrictEqual({});
      const estimates = await gasFeeController._fetchGasFeeEstimateData();
      expect(estimates).toHaveProperty('gasFeeEstimates');
      expect(gasFeeController.state.gasFeeEstimates).toHaveProperty(
        'estimatedBaseFee',
      );
    });
  });
});
