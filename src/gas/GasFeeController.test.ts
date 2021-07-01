import { stub } from 'sinon';
import nock from 'nock';
import { ControllerMessenger } from '../ControllerMessenger';
import {
  GasFeeController,
  GetGasFeeState,
  GasFeeStateChange,
  LegacyGasPriceEstimate,
} from './GasFeeController';
import { EXTERNAL_GAS_PRICES_API_URL } from './gas-util';

const GAS_FEE_API = 'https://mock-gas-server.herokuapp.com/';

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
  let getIsMainnet: jest.Mock<boolean>;
  let getIsEIP1559Compatible: jest.Mock<Promise<boolean>>;

  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    getIsMainnet = jest.fn().mockImplementation(() => false);
    getIsEIP1559Compatible = jest
      .fn()
      .mockImplementation(() => Promise.resolve(true));
    nock(GAS_FEE_API)
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

    nock(EXTERNAL_GAS_PRICES_API_URL)
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
      onNetworkStateChange: () => stub(),
      getIsMainnet,
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

  describe('when on mainnet before london', () => {
    it('should _fetchGasFeeEstimateData', async () => {
      getIsMainnet.mockImplementation(() => true);
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
      getIsMainnet.mockImplementation(() => true);
      expect(gasFeeController.state.gasFeeEstimates).toStrictEqual({});
      const estimates = await gasFeeController._fetchGasFeeEstimateData();
      expect(estimates).toHaveProperty('gasFeeEstimates');
      expect(gasFeeController.state.gasFeeEstimates).toHaveProperty(
        'estimatedBaseFee',
      );
    });
  });
});
