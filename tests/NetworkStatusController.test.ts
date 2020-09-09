import { stub } from 'sinon';
import NetworkStatusController from '../src/network/NetworkStatusController';

const DOWN_NETWORK_STATUS = {
  kovan: 'down',
  mainnet: 'down',
  rinkeby: 'down',
  ropsten: 'down',
};

describe('NetworkStatusController', () => {
  it('should set default state', () => {
    const controller = new NetworkStatusController();
    expect(controller.state).toEqual({
      networkStatus: {
        infura: DOWN_NETWORK_STATUS,
      },
    });
  });

  it('should set default config', () => {
    const controller = new NetworkStatusController();
    expect(controller.config).toEqual({ interval: 180000 });
  });

  it('should update all the statuses', async () => {
    const controller = new NetworkStatusController();
    expect(controller.state.networkStatus).toEqual({ infura: DOWN_NETWORK_STATUS });
    await controller.updateNetworkStatuses();
    expect(controller.state.networkStatus.infura.mainnet).toBeDefined();
    const status = controller.state.networkStatus.infura.mainnet;
    expect(status === 'ok' || status === 'degraded').toBe(true);
  });

  it('should poll and update statuses in the right interval', () => {
    return new Promise((resolve) => {
      const mock = stub(NetworkStatusController.prototype, 'updateNetworkStatuses');
      new NetworkStatusController({ interval: 10 });
      expect(mock.called).toBe(true);
      expect(mock.calledTwice).toBe(false);
      setTimeout(() => {
        expect(mock.calledTwice).toBe(true);
        mock.restore();
        resolve();
      }, 15);
    });
  });

  it('should not update statuses if disabled', async () => {
    const controller = new NetworkStatusController({
      interval: 10,
    });
    controller.updateInfuraStatus = stub();
    controller.disabled = true;
    await controller.updateNetworkStatuses();
    expect((controller.updateInfuraStatus as any).called).toBe(false);
  });

  it('should clear previous interval', () => {
    const mock = stub(global, 'clearTimeout');
    const controller = new NetworkStatusController({ interval: 1337 });
    return new Promise((resolve) => {
      setTimeout(() => {
        controller.poll(1338);
        expect(mock.called).toBe(true);
        mock.restore();
        resolve();
      }, 100);
    });
  });
});
