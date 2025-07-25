import { ShieldController } from './ShieldController';
import { createMockBackend } from '../tests/mocks/backend';
import { createMockMessenger } from '../tests/mocks/messenger';
import { createSubscriptionControllerMock } from '../tests/mocks/subscriptionController';
import { generateMockTxMeta } from '../tests/txUtils';

/**
 *
 */
function setup() {
  const backend = createMockBackend();
  const { messenger, baseMessenger } = createMockMessenger();

  const subscriptionControllerMessenger = baseMessenger.getRestricted({
    name: 'SubscriptionController',
    allowedActions: [],
    allowedEvents: [],
  });
  const subscriptionController = createSubscriptionControllerMock(
    subscriptionControllerMessenger,
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
    subscriptionController,
  };
}

describe('ShieldController', () => {
  it('should trigger checkCoverage when a new transaction is added', async () => {
    const { baseMessenger, backend } = setup();
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
    expect(backend.checkCoverage).toHaveBeenCalledWith(txMeta.txParams);
  });

  it('should not fetch coverage if user is not subscribed', async () => {
    const { controller, backend, subscriptionController } = setup();
    subscriptionController.checkSubscriptionStatus.mockResolvedValueOnce(
      Promise.resolve('not-subscribed'),
    );
    const txMeta = generateMockTxMeta();
    await expect(controller.checkCoverage(txMeta.txParams)).rejects.toThrow(
      'Not subscribed',
    );
    expect(backend.checkCoverage).not.toHaveBeenCalled();
  });
});
