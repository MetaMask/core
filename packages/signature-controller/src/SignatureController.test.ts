/* eslint-disable jsdoc/require-jsdoc */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

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
  status: SignatureRequestStatus.Unapproved,
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
    it('returns the messages in state', () => {
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
  });
});
