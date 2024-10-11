import type { SIWEMessage } from '@metamask/controller-utils';
import { detectSIWE } from '@metamask/controller-utils';
import { SignTypedDataVersion } from '@metamask/keyring-controller';
import { LogType, SigningStage } from '@metamask/logging-controller';

import { flushPromises } from '../../../tests/helpers';
import type {
  SignatureControllerMessenger,
  SignatureControllerOptions,
  SignatureControllerState,
} from './SignatureController';
import { SignatureController } from './SignatureController';
import type { MessageParamsPersonal, SignatureRequest } from './types';
import { SignatureRequestStatus, SignatureRequestType } from './types';
import {
  normalizePersonalMessageParams,
  normalizeTypedMessageParams,
} from './utils/normalize';

jest.mock('./utils/validation');
jest.mock('./utils/normalize');

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  detectSIWE: jest.fn(),
}));

const CHAIN_ID_MOCK = '0x1';
const FROM_MOCK = '0x456DEF';
const DATA_MOCK = '0xABC123';
const SIGNATURE_HASH_MOCK = '0x123ABC';

const PARAMS_MOCK = {
  from: FROM_MOCK,
  data: DATA_MOCK,
};

const SIGNATURE_REQUEST_MOCK: SignatureRequest = {
  id: '1',
  messageParams: PARAMS_MOCK,
  status: SignatureRequestStatus.Signed,
  time: Date.now(),
  type: SignatureRequestType.PersonalSign,
};

/**
 * Create a mock messenger instance.
 * @returns The mock messenger instance plus individual mock functions for each action.
 */
function createMessengerMock() {
  const loggingControllerAddMock = jest.fn();
  const approvalControllerAddRequestMock = jest.fn();
  const keyringControllerSignPersonalMessageMock = jest.fn();
  const keyringControllerSignTypedMessageMock = jest.fn();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

/**
 * Create a new instance of the SignatureController.
 * @param options - Optional overrides for the default options.
 * @returns The controller instance plus individual mock functions for each action.
 */
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
  const normalizePersonalMessageParamsMock = jest.mocked(
    normalizePersonalMessageParams,
  );

  const normalizeTypedMessageParamsMock = jest.mocked(
    normalizeTypedMessageParams,
  );

  const detectSIWEMock = jest.mocked(detectSIWE);

  beforeEach(() => {
    jest.resetAllMocks();

    normalizePersonalMessageParamsMock.mockImplementation((params) => params);
    normalizeTypedMessageParamsMock.mockImplementation((params) => params);
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

    it('emits event if reason provided', () => {
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

      const listener = jest.fn();

      const { controller } = createController({
        state: {
          signatureRequests,
        } as unknown as SignatureControllerState,
      });

      controller.hub.on('cancelWithReason', listener);

      controller.rejectUnapproved('Custom reason');

      expect(listener).toHaveBeenCalledTimes(2);

      expect(listener).toHaveBeenCalledWith({
        metadata: signatureRequests['2'],
        reason: 'Custom reason',
      });

      expect(listener).toHaveBeenCalledWith({
        metadata: signatureRequests['3'],
        reason: 'Custom reason',
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
      (controller: SignatureController, request = {}) =>
        controller.newUnsignedPersonalMessage({ ...PARAMS_MOCK }, request),
    ],
    [
      'newUnsignedTypedMessage',
      (controller: SignatureController, request = {}) =>
        controller.newUnsignedTypedMessage(
          PARAMS_MOCK,
          request,
          SignTypedDataVersion.V1,
          { parseJsonData: false },
        ),
    ],
  ])('%s', (_title: string, fn) => {
    it('throws if rejected', async () => {
      const { controller, approvalControllerAddRequestMock } =
        createController();

      const errorMock = new Error('Custom message');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (errorMock as any).code = 1234;

      approvalControllerAddRequestMock.mockRejectedValueOnce(errorMock);

      const promise = controller.newUnsignedPersonalMessage(
        { ...PARAMS_MOCK },
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

    it('populates origin from request', async () => {
      const { controller } = createController();

      await fn(controller, { origin: 'test' });

      const id = Object.keys(controller.state.signatureRequests)[0];

      expect(controller.state.signatureRequests[id].messageParams.origin).toBe(
        'test',
      );
    });

    it('populates request ID from request', async () => {
      const { controller } = createController();

      await fn(controller, { id: 'test' });

      const id = Object.keys(controller.state.signatureRequests)[0];

      expect(
        controller.state.signatureRequests[id].messageParams.requestId,
      ).toBe('test');
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
        { ...PARAMS_MOCK },
        {},
      );

      expect(result).toBe(SIGNATURE_HASH_MOCK);
    });

    it('adds SIWE data', async () => {
      const { controller } = createController();

      const siweMock = {
        isSIWEMessage: true,
        parsedMessage: { domain: 'test' },
      } as SIWEMessage;

      detectSIWEMock.mockReturnValueOnce(siweMock);

      await controller.newUnsignedPersonalMessage({ ...PARAMS_MOCK }, {});

      const id = Object.keys(controller.state.signatureRequests)[0];

      const messageParams = controller.state.signatureRequests[id]
        .messageParams as MessageParamsPersonal;

      expect(messageParams.siwe).toStrictEqual(siweMock);
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
        PARAMS_MOCK,
        {},
        SignTypedDataVersion.V1,
        { parseJsonData: false },
      );

      expect(result).toBe(SIGNATURE_HASH_MOCK);
    });

    it.each([SignTypedDataVersion.V3, SignTypedDataVersion.V4])(
      'supports data as string with version %s',
      async (version) => {
        const { controller, keyringControllerSignTypedMessageMock } =
          createController();

        keyringControllerSignTypedMessageMock.mockResolvedValueOnce(
          SIGNATURE_HASH_MOCK,
        );

        const result = await controller.newUnsignedTypedMessage(
          {
            ...PARAMS_MOCK,
            data: JSON.stringify({ test: 123 }),
          },
          {},
          version as SignTypedDataVersion,
          { parseJsonData: true },
        );

        expect(keyringControllerSignTypedMessageMock).toHaveBeenCalledWith(
          {
            ...PARAMS_MOCK,
            data: { test: 123 },
          },
          version,
        );

        expect(result).toBe(SIGNATURE_HASH_MOCK);
      },
    );

    it('ignores parseJsonData if version is V1', async () => {
      const { controller, keyringControllerSignTypedMessageMock } =
        createController();

      keyringControllerSignTypedMessageMock.mockResolvedValueOnce(
        SIGNATURE_HASH_MOCK,
      );

      const result = await controller.newUnsignedTypedMessage(
        {
          ...PARAMS_MOCK,
          data: JSON.stringify({ test: 123 }),
        },
        {},
        SignTypedDataVersion.V1,
        { parseJsonData: true },
      );

      expect(keyringControllerSignTypedMessageMock).toHaveBeenCalledWith(
        {
          ...PARAMS_MOCK,
          data: JSON.stringify({ test: 123 }),
        },
        SignTypedDataVersion.V1,
      );

      expect(result).toBe(SIGNATURE_HASH_MOCK);
    });

    it('sets status to errored if signing fails', async () => {
      const { controller, keyringControllerSignTypedMessageMock } =
        createController();

      const errorMock = new Error('Custom message');

      keyringControllerSignTypedMessageMock.mockRejectedValueOnce(errorMock);

      await expect(
        controller.newUnsignedTypedMessage(
          PARAMS_MOCK,
          {},
          SignTypedDataVersion.V3,
          { parseJsonData: false },
        ),
      ).rejects.toThrow(errorMock);

      const id = Object.keys(controller.state.signatureRequests)[0];

      expect(controller.state.signatureRequests[id].status).toBe(
        SignatureRequestStatus.Errored,
      );
    });
  });

  describe('setDeferredSignSuccess', () => {
    it('sets the signature and status on the signature request', () => {
      const { controller } = createController({
        state: {
          signatureRequests: {
            '1': {
              ...SIGNATURE_REQUEST_MOCK,
              status: SignatureRequestStatus.InProgress,
            },
          },
        } as unknown as SignatureControllerState,
      });

      controller.setDeferredSignSuccess('1', SIGNATURE_HASH_MOCK);

      expect(controller.state.signatureRequests['1'].rawSig).toBe(
        SIGNATURE_HASH_MOCK,
      );

      expect(controller.state.signatureRequests['1'].status).toBe(
        SignatureRequestStatus.Signed,
      );
    });

    it('resolves defered signature request', async () => {
      const { controller } = createController();
      let resolved = false;

      const signaturePromise = controller
        .newUnsignedPersonalMessage(
          {
            ...PARAMS_MOCK,
            deferSetAsSigned: true,
          },
          {},
        )
        .then((result) => {
          resolved = true;
          return result;
        });

      await flushPromises();

      expect(resolved).toBe(false);

      const id = Object.keys(controller.state.signatureRequests)[0];
      controller.setDeferredSignSuccess(id, SIGNATURE_HASH_MOCK);

      await flushPromises();

      expect(resolved).toBe(true);
      expect(await signaturePromise).toBe(SIGNATURE_HASH_MOCK);
    });

    it('throws if signature request not found', () => {
      const { controller } = createController();

      expect(() => {
        controller.setDeferredSignSuccess('1', SIGNATURE_HASH_MOCK);
      }).toThrow('Signature request with id 1 not found');
    });
  });

  describe('setMessageMetadata', () => {
    it('sets the metadata on the signature request', () => {
      const { controller } = createController({
        state: {
          signatureRequests: {
            '1': SIGNATURE_REQUEST_MOCK,
          },
        } as unknown as SignatureControllerState,
      });

      controller.setMessageMetadata('1', { test: 123 });

      expect(controller.state.signatureRequests['1'].metadata).toStrictEqual({
        test: 123,
      });
    });
  });

  describe('setDeferredSignError', () => {
    it('sets the status on the signature request to rejected', () => {
      const { controller } = createController({
        state: {
          signatureRequests: {
            '1': {
              ...SIGNATURE_REQUEST_MOCK,
              status: SignatureRequestStatus.InProgress,
            },
          },
        } as unknown as SignatureControllerState,
      });

      controller.setDeferredSignError('1');

      expect(controller.state.signatureRequests['1'].status).toBe(
        SignatureRequestStatus.Rejected,
      );
    });

    it('rejects defered signature request', async () => {
      const { controller } = createController();
      let rejectedError;

      controller
        .newUnsignedPersonalMessage(
          {
            ...PARAMS_MOCK,
            deferSetAsSigned: true,
          },
          {},
        )
        .catch((error) => {
          rejectedError = error;
        });

      await flushPromises();

      expect(rejectedError).toBeUndefined();

      const id = Object.keys(controller.state.signatureRequests)[0];
      controller.setDeferredSignError(id);

      await flushPromises();

      expect(rejectedError).toStrictEqual(
        new Error(
          'MetaMask personal_sign Signature: User denied message signature.',
        ),
      );
    });
  });

  describe.each([
    'setTypedMessageInProgress',
    'setPersonalMessageInProgress',
  ] as const)('%s', (fn) => {
    it('sets the status on the signature request to in progress', () => {
      const { controller } = createController({
        state: {
          signatureRequests: {
            '1': {
              ...SIGNATURE_REQUEST_MOCK,
              status: SignatureRequestStatus.Unapproved,
            },
          },
        } as unknown as SignatureControllerState,
      });

      controller[fn]('1');

      expect(controller.state.signatureRequests['1'].status).toBe(
        SignatureRequestStatus.InProgress,
      );
    });
  });
});
