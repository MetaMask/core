import { Messenger } from '@metamask/messenger';

import {
  PasskeyController,
  getDefaultPasskeyControllerState,
} from './PasskeyController';
import type { PasskeyControllerMessenger } from './PasskeyController';
import type { PasskeyRecord } from './types';

function getMessenger(): PasskeyControllerMessenger {
  return new Messenger({ namespace: 'PasskeyController' });
}

const mockRecord: PasskeyRecord = {
  credentialId: 'dGVzdA==',
  derivationMethod: 'userHandle',
  wrappedEncryptionKey: 'Y2lwaGVydGV4dA==',
  iv: 'aXZpdg==',
};

describe('PasskeyController', () => {
  describe('getDefaultPasskeyControllerState', () => {
    it('returns null passkeyRecord', () => {
      const state = getDefaultPasskeyControllerState();
      expect(state.passkeyRecord).toBeNull();
    });
  });

  describe('constructor', () => {
    it('initializes with default state', () => {
      const controller = new PasskeyController({ messenger: getMessenger() });
      expect(controller.state.passkeyRecord).toBeNull();
    });

    it('initializes with provided state', () => {
      const controller = new PasskeyController({
        messenger: getMessenger(),
        state: { passkeyRecord: mockRecord },
      });
      expect(controller.state.passkeyRecord).toStrictEqual(mockRecord);
    });
  });

  describe('setPasskeyRecord', () => {
    it('updates state with record', () => {
      const controller = new PasskeyController({ messenger: getMessenger() });
      controller.setPasskeyRecord(mockRecord);
      expect(controller.state.passkeyRecord).toStrictEqual(mockRecord);
    });
  });

  describe('getPasskeyRecord', () => {
    it('returns null when no record set', () => {
      const controller = new PasskeyController({ messenger: getMessenger() });
      expect(controller.getPasskeyRecord()).toBeNull();
    });

    it('returns record after set', () => {
      const controller = new PasskeyController({ messenger: getMessenger() });
      controller.setPasskeyRecord(mockRecord);
      expect(controller.getPasskeyRecord()).toStrictEqual(mockRecord);
    });
  });

  describe('isPasskeyEnrolled', () => {
    it('returns false when no record', () => {
      const controller = new PasskeyController({ messenger: getMessenger() });
      expect(controller.isPasskeyEnrolled()).toBe(false);
    });

    it('returns true after enrollment', () => {
      const controller = new PasskeyController({ messenger: getMessenger() });
      controller.setPasskeyRecord(mockRecord);
      expect(controller.isPasskeyEnrolled()).toBe(true);
    });
  });

  describe('removePasskey', () => {
    it('clears the record', () => {
      const controller = new PasskeyController({
        messenger: getMessenger(),
        state: { passkeyRecord: mockRecord },
      });
      expect(controller.isPasskeyEnrolled()).toBe(true);
      controller.removePasskey();
      expect(controller.isPasskeyEnrolled()).toBe(false);
      expect(controller.getPasskeyRecord()).toBeNull();
    });
  });

  describe('messenger actions', () => {
    it('registers method action handlers', () => {
      const messenger = getMessenger();
      const controller = new PasskeyController({ messenger });
      expect(controller.getPasskeyRecord()).toBeNull();

      messenger.call('PasskeyController:setPasskeyRecord', mockRecord);
      const result = messenger.call('PasskeyController:getPasskeyRecord');
      expect(result).toStrictEqual(mockRecord);

      expect(messenger.call('PasskeyController:isPasskeyEnrolled')).toBe(true);

      messenger.call('PasskeyController:removePasskey');
      expect(messenger.call('PasskeyController:isPasskeyEnrolled')).toBe(false);
    });
  });
});
