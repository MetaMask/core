import { stub } from 'sinon';
import {
  ControllerMessenger,
  RestrictedControllerMessenger,
} from '../ControllerMessenger';
import {
  GasFeeController,
  GetGasFeeState,
  GasFeeStateChange,
} from './GasFeeController';

const name = 'GasFeeController';

const controllerMessenger = new RestrictedControllerMessenger<
  typeof name,
  GetGasFeeState,
  GasFeeStateChange,
  never,
  never
>({
  name,
  controllerMessenger: new ControllerMessenger(),
});

describe('GasFeeController', () => {
  it('should initialize', () => {
    const controller = new GasFeeController({
      interval: 10000,
      messenger: controllerMessenger,
      getProvider: () => stub(),
      onNetworkStateChange: () => stub(),
      getCurrentNetworkEIP1559Compatibility: () => Promise.resolve(true), // change this for networkController.state.properties.isEIP1559Compatible ???
    });

    expect(controller.name).toBe(name);
  });
});
