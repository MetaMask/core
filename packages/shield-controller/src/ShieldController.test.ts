import { ShieldController } from './ShieldController';
import { createAuthenticationControllerMock } from '../tests/mocks/authenticationController';
import { createMockBackend } from '../tests/mocks/backend';
import { createMockMessenger } from '../tests/mocks/messenger';
import { generateMockTxMeta } from '../tests/txUtils';

/**
 *
 */
function setup() {
  const backend = createMockBackend();
  const { messenger, baseMessenger } = createMockMessenger();

  const authenticationControllerMessenger = baseMessenger.getRestricted({
    name: 'AuthenticationController',
    allowedActions: [],
    allowedEvents: [],
  });
  const authenticationController = createAuthenticationControllerMock(
    authenticationControllerMessenger,
  );

  const controller = new ShieldController({
    backend,
    messenger,
  });
  controller.start();
  return {
    controller,
    messenger,
    baseMessenger,
    backend,
    authenticationController,
  };
}

describe('ShieldController', () => {
  it('should trigger checkCoverage when a new transaction is added', async () => {
    const { baseMessenger, backend, authenticationController } = setup();
    const txMeta = generateMockTxMeta();
    const coverageResultReceived = new Promise<void>((resolve) => {
      baseMessenger.subscribe(
        'ShieldController:coverageResultReceived',
        (_coverageResult) => resolve(),
      );
    });
    baseMessenger.publish(
      'TransactionController:unapprovedTransactionAdded',
      txMeta,
    );
    expect(await coverageResultReceived).toBeUndefined();
    expect(backend.checkCoverage).toHaveBeenCalledWith(
      await authenticationController.getBearerToken(),
      txMeta,
    );
  });
});
