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
    nock(TEST_GAS_FEE_API.replace('<chain_id>', '1'))
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
    gasFeeController.destroy();
  });

  it('should initialize', async () => {
    expect(gasFeeController.name).toBe(name);
  });

  it('should getGasFeeEstimatesAndStartPolling', async () => {
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
