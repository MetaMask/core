import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';

import { controllerName } from '../../src/constants.js';
import type {
  ShieldApiServiceMessenger,
  ShieldControllerMessenger,
} from '../../src/index.js';
import { createMockShieldApiServiceHandlers } from './shield-api-service.js';

type AllShieldControllerActions = MessengerActions<ShieldControllerMessenger>;

type AllShieldControllerEvents = MessengerEvents<ShieldControllerMessenger>;

export type RootMessenger = Messenger<
  MockAnyNamespace,
  AllShieldControllerActions | MessengerActions<ShieldApiServiceMessenger>,
  AllShieldControllerEvents | MessengerEvents<ShieldApiServiceMessenger>
>;

/**
 * Constructs the root messenger.
 *
 * @returns A root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
}

/**
 * Create a mock messenger.
 *
 * @returns A mock messenger and service handlers.
 */
export function createMockMessenger(): {
  rootMessenger: RootMessenger;
  messenger: ShieldControllerMessenger;
  shieldApiService: ReturnType<typeof createMockShieldApiServiceHandlers>;
} {
  const rootMessenger = getRootMessenger();
  const shieldApiService = createMockShieldApiServiceHandlers();

  rootMessenger.registerActionHandler(
    'ShieldApiService:checkCoverage',
    shieldApiService.checkCoverage,
  );
  rootMessenger.registerActionHandler(
    'ShieldApiService:checkSignatureCoverage',
    shieldApiService.checkSignatureCoverage,
  );
  rootMessenger.registerActionHandler(
    'ShieldApiService:logSignature',
    shieldApiService.logSignature,
  );
  rootMessenger.registerActionHandler(
    'ShieldApiService:logTransaction',
    shieldApiService.logTransaction,
  );

  const messenger = new Messenger<
    typeof controllerName,
    AllShieldControllerActions,
    AllShieldControllerEvents,
    RootMessenger
  >({
    namespace: controllerName,
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    messenger,
    actions: [
      'ShieldApiService:checkCoverage',
      'ShieldApiService:checkSignatureCoverage',
      'ShieldApiService:logSignature',
      'ShieldApiService:logTransaction',
    ],
    events: [
      'SignatureController:stateChange',
      'TransactionController:stateChange',
    ],
  });

  return {
    rootMessenger,
    messenger,
    shieldApiService,
  };
}
