import nock from 'nock';
import { ControllerMessenger } from '../ControllerMessenger';
import {
  TokenListController,
  TokenListStateChange,
  GetTokenListState,
} from './TokenListController';

const name = 'TokenListController';

function getRestrictedMessenger() {
  // The 'Other' types are included to demonstrate that this all works with a
  // controller messenger that includes types from other controllers.
  const controllerMessenger = new ControllerMessenger<
    GetTokenListState,
    TokenListStateChange
  >();
  const messenger = controllerMessenger.getRestricted<
    'TokenListController',
    never,
    never
  >({
    name,
  });
  return messenger;
}

describe('TokenListController', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('should set default state', async () => {
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      interval: 100,
      messenger,
    });
    await controller.start();
    expect(Object.keys(controller.state.tokens).length).toBeGreaterThan(0);
    // controller.stop();
    controller.destroy();
  });
});
