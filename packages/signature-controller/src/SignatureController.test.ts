/* eslint-disable jsdoc/require-jsdoc */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { SignTypedDataVersion } from '@metamask/keyring-controller';
import {
  LogType,
  SigningMethod,
  SigningStage,
} from '@metamask/logging-controller';
import { sign } from 'crypto';

import type {
  SignatureControllerMessenger,
  SignatureControllerOptions,
  SignatureControllerState,
} from './SignatureController';
import { SignatureController } from './SignatureController';
import type { SignatureRequest } from './types';
import { SignatureRequestStatus, SignatureRequestType } from './types';

jest.mock('./validation');

const CHAIN_ID_MOCK = '0x1';
const SIGNATURE_HASH_MOCK = '0x123ABC';

const SIGNATURE_REQUEST_MOCK: SignatureRequest = {
  id: '1',
  request: {
    from: '0xAddress',
    data: '0xData',
  },
  status: SignatureRequestStatus.Signed,
  time: Date.now(),
  type: SignatureRequestType.PersonalSign,
};

function createMessengerMock() {
  const loggingControllerAddMock = jest.fn();
  const approvalControllerAddRequestMock = jest.fn();
  const keyringControllerSignPersonalMessageMock = jest.fn();
  const keyringControllerSignTypedMessageMock = jest.fn();

  const callMock = (method: string, ...args: any[]) => {
    switch (method) {
      case 'LoggingController:add':
        return loggingControllerAddMock(...args);
      case 'ApprovalController:addRequest':
        return approvalControllerAddRequestMock(...args);
      case 'KeyringController:signPersonalMessage':
        return keyringControllerSignPersonalMessageMock(...args);
      case 'KeyringController:signTypedMessage':
        return keyringControllerSignTypedMessageMock(...args);
      default:
        throw new Error(`Messenger method not recognised: ${method}`);
    }
  };

  const messenger = {
    registerActionHandler: jest.fn(),
    registerInitialEventPayload: jest.fn(),
    publish: jest.fn(),
    call: callMock,
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as unknown as jest.Mocked<SignatureControllerMessenger>;

  approvalControllerAddRequestMock.mockResolvedValue({});
  loggingControllerAddMock.mockResolvedValue({});

  return {
    approvalControllerAddRequestMock,
    keyringControllerSignPersonalMessageMock,
    keyringControllerSignTypedMessageMock,
    loggingControllerAddMock,
    messenger,
  };
}

function createController(options?: Partial<SignatureControllerOptions>) {
  const messengerMocks = createMessengerMock();

  const controller = new SignatureController({
    messenger: messengerMocks.messenger,
    getCurrentChainId: () => CHAIN_ID_MOCK,
    ...options,
  });

  return { controller, ...messengerMocks };
}

describe('SignatureController', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('unapprovedPersonalMessagesCount', () => {
    it('returns the number of unapproved personal messages in state', () => {
      const { controller } = createController({
        state: {
          unapprovedPersonalMsgCount: 3,
        } as SignatureControllerState,
      });

      expect(controller.unapprovedPersonalMessagesCount).toBe(3);
    });
  });

  describe('unapprovedTypedMessagesCount', () => {
    it('returns the number of unapproved typed messages in state', () => {
      const { controller } = createController({
        state: {
          unapprovedTypedMessagesCount: 3,
        } as SignatureControllerState,
      });

      expect(controller.unapprovedTypedMessagesCount).toBe(3);
    });
  });

  describe('messages', () => {
    it('returns the signature requests in state', () => {
      const { controller } = createController({
        state: {
          signatureRequests: {
            '1': SIGNATURE_REQUEST_MOCK,
            '2': SIGNATURE_REQUEST_MOCK,
          },
        } as unknown as SignatureControllerState,
      });

      expect(controller.messages).toStrictEqual({
        '1': SIGNATURE_REQUEST_MOCK,
        '2': SIGNATURE_REQUEST_MOCK,
      });
    });
  });

  describe('resetState', () => {
    it('resets the state to default state', () => {
      const { controller } = createController({
        state: {
          signatureRequests: {
            '1': SIGNATURE_REQUEST_MOCK,
          },
          unapprovedPersonalMsgs: {
            '1': SIGNATURE_REQUEST_MOCK,
          },
          unapprovedTypedMessages: {
            '1': SIGNATURE_REQUEST_MOCK,
          },
          unapprovedPersonalMsgCount: 1,
          unapprovedTypedMessagesCount: 1,
        } as unknown as SignatureControllerState,
      });

      controller.resetState();

      expect(controller.state).toStrictEqual({
        signatureRequests: {},
        unapprovedPersonalMsgs: {},
        unapprovedTypedMessages: {},
        unapprovedPersonalMsgCount: 0,
        unapprovedTypedMessagesCount: 0,
      });
    });
  });

  describe('rejectUnapproved', () => {
    it('rejects all signature requests with unapproved status', () => {
      const signatureRequests = {
        '1': SIGNATURE_REQUEST_MOCK,
        '2': {
          ...SIGNATURE_REQUEST_MOCK,
          id: '2',
          status: SignatureRequestStatus.Unapproved,
        },
        '3': {
          ...SIGNATURE_REQUEST_MOCK,
          id: '3',
          type: SignatureRequestType.TypedSign,
          status: SignatureRequestStatus.Unapproved,
        },
      };

      const { controller } = createController({
        state: {
          signatureRequests,
        } as unknown as SignatureControllerState,
      });

      controller.rejectUnapproved();

      expect(controller.state.signatureRequests).toStrictEqual({
        '1': signatureRequests['1'],
        '2': {
          ...signatureRequests['2'],
          status: SignatureRequestStatus.Rejected,
        },
        '3': {
          ...signatureRequests['3'],
          status: SignatureRequestStatus.Rejected,
        },
      });
    });
  });

  describe('clearUnapproved', () => {
    it('deletes all signature requests with unapproved status', () => {
      const signatureRequests = {
        '1': SIGNATURE_REQUEST_MOCK,
        '2': {
          ...SIGNATURE_REQUEST_MOCK,
          id: '2',
          status: SignatureRequestStatus.Unapproved,
        },
        '3': {
          ...SIGNATURE_REQUEST_MOCK,
          id: '3',
          type: SignatureRequestType.TypedSign,
          status: SignatureRequestStatus.Unapproved,
        },
      };

      const { controller } = createController({
        state: {
          signatureRequests,
        } as unknown as SignatureControllerState,
      });

      controller.clearUnapproved();

      expect(controller.state.signatureRequests).toStrictEqual({
        '1': signatureRequests['1'],
      });
    });
  });

  describe.each([
    [
      'newUnsignedPersonalMessage',
      (controller: SignatureController) =>
        controller.newUnsignedPersonalMessage(
          {
            data: '0xData',
            from: '0xAddress',
          },
          {},
        ),
    ],
    [
      'newUnsignedTypedMessage',
      (controller: SignatureController) =>
        controller.newUnsignedTypedMessage(
          { data: '0xData', from: '0xAddress' },
          {},
          SignTypedDataVersion.V1,
          { parseJsonData: false },
        ),
    ],
  ])('%s', (_title: string, fn) => {
    it('throws if rejected', async () => {
      const { controller, approvalControllerAddRequestMock } =
        createController();

      const errorMock = new Error('Custom message');
      (errorMock as any).code = 1234;

      approvalControllerAddRequestMock.mockRejectedValueOnce(errorMock);

      const promise = controller.newUnsignedPersonalMessage(
        {
          data: '0xData',
          from: '0xAddress',
        },
        {},
      );

      await expect(promise).rejects.toMatchObject({
        message: 'Custom message',
        code: 1234,
      });
    });

    it('invokes success callback if approved', async () => {
      const resultCallbackSuccessMock = jest.fn();

      const {
        controller,
        approvalControllerAddRequestMock,
        keyringControllerSignPersonalMessageMock,
        keyringControllerSignTypedMessageMock,
      } = createController();

      approvalControllerAddRequestMock.mockResolvedValueOnce({
        resultCallbacks: {
          success: resultCallbackSuccessMock,
        },
      });

      keyringControllerSignPersonalMessageMock.mockResolvedValueOnce(
        SIGNATURE_HASH_MOCK,
      );

      keyringControllerSignTypedMessageMock.mockResolvedValueOnce(
        SIGNATURE_HASH_MOCK,
      );

      await fn(controller);

      expect(resultCallbackSuccessMock).toHaveBeenCalledTimes(1);
      expect(resultCallbackSuccessMock).toHaveBeenCalledWith(
        SIGNATURE_HASH_MOCK,
      );
    });

    it('invokes error callback if signing fails', async () => {
      const resultCallbackErrorMock = jest.fn();

      const errorMock = new Error('Custom message');

      const {
        controller,
        approvalControllerAddRequestMock,
        keyringControllerSignPersonalMessageMock,
        keyringControllerSignTypedMessageMock,
      } = createController();

      approvalControllerAddRequestMock.mockResolvedValueOnce({
        resultCallbacks: {
          error: resultCallbackErrorMock,
        },
      });

      keyringControllerSignPersonalMessageMock.mockRejectedValueOnce(errorMock);
      keyringControllerSignTypedMessageMock.mockRejectedValueOnce(errorMock);

      await expect(fn(controller)).rejects.toThrow(errorMock);

      expect(resultCallbackErrorMock).toHaveBeenCalledTimes(1);
      expect(resultCallbackErrorMock).toHaveBeenCalledWith(errorMock);
    });

    it('adds logs to logging controller if approved', async () => {
      const { controller, loggingControllerAddMock } = createController();

      await fn(controller);

      expect(loggingControllerAddMock).toHaveBeenCalledTimes(2);

      expect(loggingControllerAddMock).toHaveBeenCalledWith({
        type: LogType.EthSignLog,
        data: {
          signingMethod: expect.any(String),
          stage: SigningStage.Proposed,
          signingData: expect.any(Object),
        },
      });

      expect(loggingControllerAddMock).toHaveBeenCalledWith({
        type: LogType.EthSignLog,
        data: {
          signingMethod: expect.any(String),
          stage: SigningStage.Signed,
          signingData: expect.any(Object),
        },
      });
    });

    it('adds logs to logging controller if rejected', async () => {
      const {
        controller,
        loggingControllerAddMock,
        approvalControllerAddRequestMock,
      } = createController();

      const errorMock = new Error('Custom message');

      approvalControllerAddRequestMock.mockRejectedValueOnce(errorMock);

      await expect(fn(controller)).rejects.toThrow(errorMock);

      expect(loggingControllerAddMock).toHaveBeenCalledTimes(2);

      expect(loggingControllerAddMock).toHaveBeenCalledWith({
        type: LogType.EthSignLog,
        data: {
          signingMethod: expect.any(String),
          stage: SigningStage.Proposed,
          signingData: expect.any(Object),
        },
      });

      expect(loggingControllerAddMock).toHaveBeenCalledWith({
        type: LogType.EthSignLog,
        data: {
          signingMethod: expect.any(String),
          stage: SigningStage.Rejected,
          signingData: expect.any(Object),
        },
      });
    });
  });

  describe('newUnsignedPersonalMessage', () => {
    it('returns signature hash if approved', async () => {
      const { controller, keyringControllerSignPersonalMessageMock } =
        createController();

      keyringControllerSignPersonalMessageMock.mockResolvedValueOnce(
        SIGNATURE_HASH_MOCK,
      );

      const result = await controller.newUnsignedPersonalMessage(
        {
          data: '0xData',
          from: '0xAddress',
        },
        {},
      );

      expect(result).toBe(SIGNATURE_HASH_MOCK);
    });
  });

  describe('newUnsignedTypedMessage', () => {
    it('returns signature hash if approved', async () => {
      const { controller, keyringControllerSignTypedMessageMock } =
        createController();

      keyringControllerSignTypedMessageMock.mockResolvedValueOnce(
        SIGNATURE_HASH_MOCK,
      );

      const result = await controller.newUnsignedTypedMessage(
        {
          data: '0xData',
          from: '0xAddress',
        },
        {},
        SignTypedDataVersion.V1,
        { parseJsonData: false },
      );

      expect(result).toBe(SIGNATURE_HASH_MOCK);
    });
  });
});
