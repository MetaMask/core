import { ControllerMessenger } from '@metamask/base-controller';
import * as uuid from 'uuid';

import type { LoggingControllerActions } from './LoggingController';
import { LoggingController } from './LoggingController';
import { LogType } from './logTypes';
import { SigningMethod, SigningStage } from './logTypes/EthSignLog';

jest.mock('uuid', () => {
  const actual = jest.requireActual('uuid');
  return {
    ...actual,
    v1: jest.fn(() => actual.v1()),
  };
});

const name = 'LoggingController';

/**
 * Constructs a unrestricted controller messenger.
 *
 * @returns A unrestricted controller messenger.
 */
function getUnrestrictedMessenger() {
  return new ControllerMessenger<LoggingControllerActions, never>();
}

/**
 * Constructs a restricted controller messenger.
 *
 * @param controllerMessenger - An optional unrestricted messenger
 * @returns A restricted controller messenger.
 */
function getRestrictedMessenger(
  controllerMessenger = getUnrestrictedMessenger(),
) {
  return controllerMessenger.getRestricted({
    name,
    allowedActions: [],
    allowedEvents: [],
  });
}

describe('LoggingController', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
  it('action: LoggingController:add with generic log', async () => {
    const unrestricted = getUnrestrictedMessenger();
    const messenger = getRestrictedMessenger(unrestricted);

    const controller = new LoggingController({
      messenger,
    });

    expect(
      await unrestricted.call('LoggingController:add', {
        type: LogType.GenericLog,
        data: `Generic log`,
      }),
    ).toBeUndefined();
    const logs = Object.values(controller.state.logs);
    expect(logs).toHaveLength(1);
    expect(logs).toContainEqual({
      timestamp: expect.any(Number),
      id: expect.any(String),
      log: expect.objectContaining({
        type: LogType.GenericLog,
        data: 'Generic log',
      }),
    });
  });

  it('action: LoggingController:add for a signing request', async () => {
    const unrestricted = getUnrestrictedMessenger();
    const messenger = getRestrictedMessenger(unrestricted);

    const controller = new LoggingController({
      messenger,
    });

    expect(
      await unrestricted.call('LoggingController:add', {
        type: LogType.EthSignLog,
        data: {
          signingMethod: SigningMethod.EthSign,
          stage: SigningStage.Proposed,
          signingData: '0x0000000000000',
        },
      }),
    ).toBeUndefined();
    const logs = Object.values(controller.state.logs);
    expect(logs).toHaveLength(1);
    expect(logs).toContainEqual({
      timestamp: expect.any(Number),
      id: expect.any(String),
      log: expect.objectContaining({
        type: LogType.EthSignLog,
        data: {
          signingMethod: SigningMethod.EthSign,
          stage: SigningStage.Proposed,
          signingData: '0x0000000000000',
        },
      }),
    });
  });

  it('action: LoggingController:add prevents possible collision of ids', async () => {
    const unrestricted = getUnrestrictedMessenger();
    const messenger = getRestrictedMessenger(unrestricted);

    const controller = new LoggingController({
      messenger,
    });

    expect(
      await unrestricted.call('LoggingController:add', {
        type: LogType.GenericLog,
        data: `Generic log`,
      }),
    ).toBeUndefined();

    const { id } = Object.values(controller.state.logs)[0];

    if (jest.isMockFunction(uuid.v1)) {
      uuid.v1.mockImplementationOnce(() => id);
    }

    expect(
      await unrestricted.call('LoggingController:add', {
        type: LogType.GenericLog,
        data: `Generic log 2`,
      }),
    ).toBeUndefined();
    const logs = Object.values(controller.state.logs);
    expect(logs).toHaveLength(2);
    expect(logs).toContainEqual({
      timestamp: expect.any(Number),
      id,
      log: expect.objectContaining({
        type: LogType.GenericLog,
        data: 'Generic log',
      }),
    });

    expect(logs).toContainEqual({
      timestamp: expect.any(Number),
      id: expect.any(String),
      log: expect.objectContaining({
        type: LogType.GenericLog,
        data: 'Generic log 2',
      }),
    });

    expect(uuid.v1).toHaveBeenCalledTimes(3);
  });

  it('internal method: clear', async () => {
    const unrestricted = getUnrestrictedMessenger();
    const messenger = getRestrictedMessenger(unrestricted);

    const controller = new LoggingController({
      messenger,
    });

    expect(
      await unrestricted.call('LoggingController:add', {
        type: LogType.EthSignLog,
        data: {
          signingMethod: SigningMethod.EthSign,
          stage: SigningStage.Proposed,
          signingData: '0x0000000000000',
        },
      }),
    ).toBeUndefined();
    expect(Object.values(controller.state.logs)).toHaveLength(1);
    expect(controller.clear()).toBeUndefined();
    const logs = Object.values(controller.state.logs);
    expect(logs).toHaveLength(0);
  });
});
