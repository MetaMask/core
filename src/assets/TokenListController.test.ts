import type { Patch } from 'immer';
import nock from 'nock';
import { ControllerMessenger } from '../ControllerMessenger';
import {
  TokenListController,
  TokenListStateChange,
  GetTokenListState,
} from './TokenListController';

const name = 'TokenListController';

type OtherStateChange = {
  type: `OtherController:stateChange`;
  payload: [{ stuff: string }, Patch[]];
};

type GetOtherState = {
  type: `OtherController:getState`;
  handler: () => { stuff: string };
};

function getRestrictedMessenger() {
  // The 'Other' types are included to demonstrate that this all works with a
  // controller messenger that includes types from other controllers.
  const controllerMessenger = new ControllerMessenger<
    GetTokenListState | GetOtherState,
    TokenListStateChange | OtherStateChange
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
    // controller.stop();
    controller.destroy();

  });
});
