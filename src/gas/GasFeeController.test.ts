import { stub } from 'sinon';
import nock from 'nock';
import { ControllerMessenger } from '../ControllerMessenger';
import {
  GasFeeController,
  GetGasFeeState,
  GasFeeStateChange,
} from './GasFeeController';

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

  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    nock(GAS_FEE_API)
      .get('/')
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
      });

    gasFeeController = new GasFeeController({
      interval: 10000,
      messenger: getRestrictedMessenger(),
      getProvider: () => stub(),
      onNetworkStateChange: () => stub(),
      getCurrentNetworkEIP1559Compatibility: () => Promise.resolve(true), // change this for networkController.state.properties.isEIP1559Compatible ???
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

  it('should _fetchGasFeeEstimateData', async () => {
    expect(gasFeeController.state.gasFeeEstimates).toStrictEqual({});
    const estimates = await gasFeeController._fetchGasFeeEstimateData();
    expect(estimates).toHaveProperty('gasFeeEstimates');
    expect(gasFeeController.state.gasFeeEstimates).toHaveProperty(
      'estimatedBaseFee',
    );
  });
});
