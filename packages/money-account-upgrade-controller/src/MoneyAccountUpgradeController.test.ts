import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import type { MoneyAccountUpgradeControllerMessenger } from '.';
import {
  MoneyAccountUpgradeController,
  getDefaultMoneyAccountUpgradeControllerState,
} from '.';

type AllMoneyAccountUpgradeControllerActions =
  MessengerActions<MoneyAccountUpgradeControllerMessenger>;

type AllMoneyAccountUpgradeControllerEvents =
  MessengerEvents<MoneyAccountUpgradeControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllMoneyAccountUpgradeControllerActions,
  AllMoneyAccountUpgradeControllerEvents
>;

function setup(): {
  controller: MoneyAccountUpgradeController;
  rootMessenger: RootMessenger;
  messenger: MoneyAccountUpgradeControllerMessenger;
} {
  const rootMessenger = new Messenger<
    MockAnyNamespace,
    AllMoneyAccountUpgradeControllerActions,
    AllMoneyAccountUpgradeControllerEvents
  >({ namespace: MOCK_ANY_NAMESPACE });

  const messenger: MoneyAccountUpgradeControllerMessenger = new Messenger({
    namespace: 'MoneyAccountUpgradeController',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    actions: [],
    events: [],
    messenger,
  });

  const controller = new MoneyAccountUpgradeController({
    messenger,
  });

  return {
    controller,
    rootMessenger,
    messenger,
  };
}

describe('MoneyAccountUpgradeController', () => {
  describe('constructor', () => {
    it('initializes with default state when no state is provided', () => {
      const { controller } = setup();

      expect(controller.state).toStrictEqual(
        getDefaultMoneyAccountUpgradeControllerState(),
      );
    });
  });

  describe('upgradeAccount', () => {
    it('resolves without error', async () => {
      const { controller } = setup();

      expect(await controller.upgradeAccount()).toBeUndefined();
    });

    it('is callable via the messenger', async () => {
      const { rootMessenger } = setup();

      expect(
        await rootMessenger.call(
          'MoneyAccountUpgradeController:upgradeAccount',
        ),
      ).toBeUndefined();
    });
  });
});
