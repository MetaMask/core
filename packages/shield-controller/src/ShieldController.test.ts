import { ShieldController } from './ShieldController';
import { createMockBackend } from '../tests/mocks/backend';
import { createMockMessenger } from '../tests/mocks/messenger';
import { generateMockTxMeta } from '../tests/txUtils';

/**
 *
 */
function setup() {
  const backend = createMockBackend();
  const { messenger, baseMessenger } = createMockMessenger();
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
  };
}

describe('ShieldController', () => {
  it('should trigger checkCoverage when a new transaction is added', async () => {
    const { baseMessenger, backend } = setup();
    const txMeta = generateMockTxMeta();
    baseMessenger.publish(
      'TransactionController:unapprovedTransactionAdded',
      txMeta,
    );
    // wait for the checkCoverage to be called
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(backend.checkCoverage).toHaveBeenCalledWith(txMeta.txParams);
  });
});
