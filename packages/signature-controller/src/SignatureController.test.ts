import {
  MessageManager,
  PersonalMessageManager,
  TypedMessageManager,
  AbstractMessage,
  OriginalRequest,
} from '@metamask/message-manager';
import { ORIGIN_METAMASK } from '@metamask/controller-utils';
import { EthereumProviderError } from 'eth-rpc-errors';
import {
  SignatureController,
  SignatureControllerMessenger,
  SignatureControllerOptions,
} from './SignatureController';

jest.mock('@metamask/message-manager', () => ({
  MessageManager: jest.fn(),
  PersonalMessageManager: jest.fn(),
  TypedMessageManager: jest.fn(),
}));

jest.mock('@metamask/controller-utils', () => {
  const actual = jest.requireActual('@metamask/controller-utils');
  return { ...actual, detectSIWE: jest.fn() };
});

class NoErrorThrownError extends Error {}
const getError = async <TError>(call: () => unknown): Promise<TError> => {
  try {
    await call();
    throw new NoErrorThrownError();
  } catch (error: unknown) {
    return error as TError;
  }
};

const messageIdMock = '123';
const messageIdMock2 = '456';
const versionMock = 'V1';

const messageParamsWithoutIdMock = {
  from: '0x123',
  origin: 'http://test.com',
  data: '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
  version: 'V1',
};

const messageParamsMock = {
  ...messageParamsWithoutIdMock,
  metamaskId: messageIdMock,
};

const messageParamsMock2 = {
  from: '0x124',
  origin: 'http://test4.com',
  data: '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFA',
  metamaskId: messageIdMock,
};

const messageMock = {
  id: messageIdMock,
  time: 123,
  status: 'unapproved',
  type: 'testType',
  rawSig: undefined,
} as any as AbstractMessage;

const coreMessageMock = {
  ...messageMock,
  messageParams: messageParamsMock,
};

const stateMessageMock = {
  ...messageMock,
  msgParams: messageParamsMock,
};

const requestMock = {
  origin: 'http://test2.com',
} as OriginalRequest;

const createMessengerMock = () =>
  ({
    registerActionHandler: jest.fn(),
    publish: jest.fn(),
    call: jest.fn(),
  } as any as jest.Mocked<SignatureControllerMessenger>);

const addUnapprovedMessageMock = jest.fn();
const waitForFinishStatusMock = jest.fn();
const approveMessageMock = jest.fn();

const createMessageManagerMock = <T>(prototype?: any): jest.Mocked<T> => {
  const messageManagerMock = Object.create(prototype);

  return Object.assign(messageManagerMock, {
    getUnapprovedMessages: jest.fn(),
    getUnapprovedMessagesCount: jest.fn(),
    addUnapprovedMessage: addUnapprovedMessageMock,
    waitForFinishStatus: waitForFinishStatusMock,
    approveMessage: approveMessageMock,
    setMessageStatusSigned: jest.fn(),
    setMessageStatusErrored: jest.fn(),
    setMessageStatusInProgress: jest.fn(),
    rejectMessage: jest.fn(),
    subscribe: jest.fn(),
    update: jest.fn(),
    hub: {
      on: jest.fn(),
    },
  }) as jest.Mocked<T>;
};

const createKeyringControllerMock = () => ({
  signMessage: jest.fn(),
  signPersonalMessage: jest.fn(),
  signTypedMessage: jest.fn(),
});

describe('SignatureController', () => {
  let signatureController: SignatureController;

  const messageManagerConstructorMock = MessageManager as jest.MockedClass<
    typeof MessageManager
  >;
  const personalMessageManagerConstructorMock =
    PersonalMessageManager as jest.MockedClass<typeof PersonalMessageManager>;
  const typedMessageManagerConstructorMock =
    TypedMessageManager as jest.MockedClass<typeof TypedMessageManager>;
  const messageManagerMock = createMessageManagerMock<MessageManager>(
    MessageManager.prototype,
  );
  const personalMessageManagerMock =
    createMessageManagerMock<PersonalMessageManager>(
      PersonalMessageManager.prototype,
    );
  const typedMessageManagerMock = createMessageManagerMock<TypedMessageManager>(
    TypedMessageManager.prototype,
  );
  const messengerMock = createMessengerMock();
  const keyringControllerMock = createKeyringControllerMock();
  const getAllStateMock = jest.fn();
  const securityProviderRequestMock = jest.fn();
  const isEthSignEnabledMock = jest.fn();
  const getCurrentChainIdMock = jest.fn();
  const keyringErrorMessageMock = 'Keyring Error';
  const keyringErrorMock = new Error(keyringErrorMessageMock);

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, 'info').mockImplementation(() => undefined);

    addUnapprovedMessageMock.mockResolvedValue(messageIdMock);
    approveMessageMock.mockResolvedValue(messageParamsWithoutIdMock);
    messageManagerConstructorMock.mockReturnValue(messageManagerMock);
    personalMessageManagerConstructorMock.mockReturnValue(
      personalMessageManagerMock,
    );

    typedMessageManagerConstructorMock.mockReturnValue(typedMessageManagerMock);

    isEthSignEnabledMock.mockReturnValue(true);

    signatureController = new SignatureController({
      messenger: messengerMock,
      keyringController: keyringControllerMock,
      getAllState: getAllStateMock,
      securityProviderRequest: securityProviderRequestMock,
      isEthSignEnabled: isEthSignEnabledMock,
      getCurrentChainId: getCurrentChainIdMock,
    } as SignatureControllerOptions);
  });

  describe('unapprovedMsgCount', () => {
    it('returns value from message manager getter', () => {
      messageManagerMock.getUnapprovedMessagesCount.mockReturnValueOnce(10);
      expect(signatureController.unapprovedMsgCount).toBe(10);
    });
  });

  describe('unapprovedPersonalMessagesCount', () => {
    it('returns value from personal message manager getter', () => {
      personalMessageManagerMock.getUnapprovedMessagesCount.mockReturnValueOnce(
        11,
      );
      expect(signatureController.unapprovedPersonalMessagesCount).toBe(11);
    });
  });

  describe('unapprovedTypedMessagesCount', () => {
    it('returns value from typed message manager getter', () => {
      typedMessageManagerMock.getUnapprovedMessagesCount.mockReturnValueOnce(
        12,
      );
      expect(signatureController.unapprovedTypedMessagesCount).toBe(12);
    });
  });

  describe('resetState', () => {
    it('sets state to initial state', () => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      signatureController.update(() => ({
        unapprovedMsgs: { [messageIdMock]: messageMock } as any,
        unapprovedPersonalMsgs: { [messageIdMock]: messageMock } as any,
        unapprovedTypedMessages: { [messageIdMock]: messageMock } as any,
        unapprovedMsgCount: 1,
        unapprovedPersonalMsgCount: 2,
        unapprovedTypedMessagesCount: 3,
      }));

      signatureController.resetState();

      expect(signatureController.state).toStrictEqual({
        unapprovedMsgs: {},
        unapprovedPersonalMsgs: {},
        unapprovedTypedMessages: {},
        unapprovedMsgCount: 0,
        unapprovedPersonalMsgCount: 0,
        unapprovedTypedMessagesCount: 0,
      });
    });
  });

  describe('rejectUnapproved', () => {
    beforeEach(() => {
      const messages = {
        [messageIdMock]: messageMock,
        [messageIdMock2]: messageMock,
      };

      messageManagerMock.getUnapprovedMessages.mockReturnValueOnce(
        messages as any,
      );
      personalMessageManagerMock.getUnapprovedMessages.mockReturnValueOnce(
        messages as any,
      );
      typedMessageManagerMock.getUnapprovedMessages.mockReturnValueOnce(
        messages as any,
      );

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      signatureController.update(() => ({
        unapprovedMsgs: messages as any,
        unapprovedPersonalMsgs: messages as any,
        unapprovedTypedMessages: messages as any,
      }));
    });

    it('rejects all messages in all message managers', () => {
      signatureController.rejectUnapproved('Test Reason');

      expect(messageManagerMock.rejectMessage).toHaveBeenCalledTimes(2);
      expect(messageManagerMock.rejectMessage).toHaveBeenCalledWith(
        messageIdMock,
      );
      expect(messageManagerMock.rejectMessage).toHaveBeenCalledWith(
        messageIdMock2,
      );

      expect(personalMessageManagerMock.rejectMessage).toHaveBeenCalledTimes(2);
      expect(personalMessageManagerMock.rejectMessage).toHaveBeenCalledWith(
        messageIdMock,
      );
      expect(personalMessageManagerMock.rejectMessage).toHaveBeenCalledWith(
        messageIdMock2,
      );

      expect(typedMessageManagerMock.rejectMessage).toHaveBeenCalledTimes(2);
      expect(typedMessageManagerMock.rejectMessage).toHaveBeenCalledWith(
        messageIdMock,
      );
      expect(typedMessageManagerMock.rejectMessage).toHaveBeenCalledWith(
        messageIdMock2,
      );
    });

    it('fires event with reject reason', () => {
      const listenerMock = jest.fn();
      signatureController.hub.on('cancelWithReason', listenerMock);

      signatureController.rejectUnapproved('Test Reason');

      expect(listenerMock).toHaveBeenCalledTimes(6);
      expect(listenerMock).toHaveBeenLastCalledWith({
        reason: 'Test Reason',
        message: messageMock,
      });
    });
  });

  describe('clearUnapproved', () => {
    it('resets state in all message managers', () => {
      signatureController.clearUnapproved();

      const defaultState = {
        unapprovedMessages: {},
        unapprovedMessagesCount: 0,
      };

      expect(messageManagerMock.update).toHaveBeenCalledTimes(1);
      expect(messageManagerMock.update).toHaveBeenCalledWith(defaultState);

      expect(personalMessageManagerMock.update).toHaveBeenCalledTimes(1);
      expect(personalMessageManagerMock.update).toHaveBeenCalledWith(
        defaultState,
      );

      expect(typedMessageManagerMock.update).toHaveBeenCalledTimes(1);
      expect(typedMessageManagerMock.update).toHaveBeenCalledWith(defaultState);
    });
  });

  describe('newUnsignedMessage', () => {
    it('throws if eth_sign disabled', async () => {
      isEthSignEnabledMock.mockReturnValueOnce(false);

      await expect(
        signatureController.newUnsignedMessage(messageParamsMock, requestMock),
      ).rejects.toThrow(
        'eth_sign has been disabled. You must enable it in the advanced settings',
      );
    });

    it('throws if data has wrong length', async () => {
      await expect(
        signatureController.newUnsignedMessage(
          { ...messageParamsMock, data: '0xFF' },
          requestMock,
        ),
      ).rejects.toThrow('eth_sign requires 32 byte message hash');
    });

    it('throws if data has wrong length and is unicode', async () => {
      await expect(
        signatureController.newUnsignedMessage(
          { ...messageParamsMock, data: '1234' },
          requestMock,
        ),
      ).rejects.toThrow('eth_sign requires 32 byte message hash');
    });

    it('adds message to message manager', async () => {
      // Satisfy one of fallback branches
      const { origin: _origin, ...messageParamsWithoutOrigin } =
        messageParamsMock;

      await signatureController.newUnsignedMessage(
        messageParamsWithoutOrigin,
        requestMock,
      );

      expect(messageManagerMock.addUnapprovedMessage).toHaveBeenCalledTimes(1);
      expect(messageManagerMock.addUnapprovedMessage).toHaveBeenCalledWith(
        messageParamsWithoutOrigin,
        requestMock,
        undefined,
      );

      expect(messengerMock.call).toHaveBeenCalledTimes(1);
      expect(messengerMock.call).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
        {
          id: messageIdMock,
          origin: ORIGIN_METAMASK,
          type: 'eth_sign',
          requestData: messageParamsWithoutOrigin,
        },
        true,
      );
    });

    it('throws if cannot get signature', async () => {
      (keyringControllerMock as any).signMessage.mockRejectedValueOnce(
        keyringErrorMock,
      );
      const error: any = await getError(
        async () =>
          await signatureController.newUnsignedMessage(
            messageParamsMock,
            requestMock,
          ),
      );

      expect(error.message).toBe(keyringErrorMessageMock);
      expect(messageManagerMock.rejectMessage).toHaveBeenCalledTimes(1);
      expect(messageManagerMock.rejectMessage).toHaveBeenCalledWith(
        messageIdMock,
      );
    });
  });

  describe('newUnsignedPersonalMessage', () => {
    it('adds message to personal message manager', async () => {
      await signatureController.newUnsignedPersonalMessage(
        messageParamsMock,
        requestMock,
      );

      expect(
        personalMessageManagerMock.addUnapprovedMessage,
      ).toHaveBeenCalledTimes(1);

      expect(
        personalMessageManagerMock.addUnapprovedMessage,
      ).toHaveBeenCalledWith(
        expect.objectContaining(messageParamsMock),
        requestMock,
        undefined,
      );

      expect(messengerMock.call).toHaveBeenCalledTimes(1);
      expect(messengerMock.call).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
        {
          id: messageIdMock,
          origin: messageParamsMock.origin,
          type: 'personal_sign',
          requestData: messageParamsMock,
        },
        true,
      );
    });

    it('throws if approval rejected', async () => {
      messengerMock.call.mockRejectedValueOnce({});
      const error: any = await getError(
        async () =>
          await signatureController.newUnsignedPersonalMessage(
            messageParamsMock,
            requestMock,
          ),
      );
      expect(error instanceof EthereumProviderError).toBe(true);
      expect(error.message).toBe('User rejected the request.');
    });

    it('throws if cannot get signature', async () => {
      (keyringControllerMock as any).signPersonalMessage.mockRejectedValueOnce(
        keyringErrorMock,
      );
      const error: any = await getError(
        async () =>
          await signatureController.newUnsignedPersonalMessage(
            messageParamsMock,
            requestMock,
          ),
      );
      expect(error.message).toBe(keyringErrorMessageMock);
      expect(personalMessageManagerMock.rejectMessage).toHaveBeenCalledTimes(1);
      expect(personalMessageManagerMock.rejectMessage).toHaveBeenCalledWith(
        messageIdMock,
      );
    });
  });

  describe('newUnsignedTypedMessage', () => {
    it('adds message to typed message manager', async () => {
      await signatureController.newUnsignedTypedMessage(
        messageParamsMock,
        requestMock,
        versionMock,
      );

      expect(
        typedMessageManagerMock.addUnapprovedMessage,
      ).toHaveBeenCalledTimes(1);
      expect(typedMessageManagerMock.addUnapprovedMessage).toHaveBeenCalledWith(
        messageParamsMock,
        requestMock,
        versionMock,
      );

      expect(messengerMock.call).toHaveBeenCalledTimes(1);
      expect(messengerMock.call).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
        {
          id: messageIdMock,
          origin: messageParamsMock.origin,
          type: 'eth_signTypedData',
          requestData: messageParamsMock,
        },
        true,
      );
    });

    it('does not set as signed, messages with deferSetAsSigned', async () => {
      const deferredMessageParams = {
        ...messageParamsMock,
        deferSetAsSigned: true,
      };
      messengerMock.call.mockResolvedValueOnce(null);
      typedMessageManagerMock.approveMessage.mockReset();
      typedMessageManagerMock.approveMessage.mockResolvedValueOnce(
        deferredMessageParams,
      );

      await signatureController.newUnsignedTypedMessage(
        messageParamsMock,
        requestMock,
        versionMock,
      );

      expect(
        typedMessageManagerMock.setMessageStatusSigned,
      ).not.toHaveBeenCalled();
    });

    it('parses JSON string in data if not V1', async () => {
      const jsonData = { test: 'value' };

      typedMessageManagerMock.approveMessage.mockReset();
      typedMessageManagerMock.approveMessage.mockResolvedValueOnce({
        ...messageParamsMock2,
        deferSetAsSigned: false,
        data: JSON.stringify(jsonData),
      });

      await signatureController.newUnsignedTypedMessage(
        messageParamsMock,
        requestMock,
        'V2',
      );

      expect(keyringControllerMock.signTypedMessage).toHaveBeenCalledTimes(1);
      expect(keyringControllerMock.signTypedMessage).toHaveBeenCalledWith(
        { ...messageParamsMock2, data: jsonData, deferSetAsSigned: false },
        { version: 'V2' },
      );
    });

    it('throws if approval rejected', async () => {
      messengerMock.call.mockRejectedValueOnce({});
      const error: any = await getError(
        async () =>
          await signatureController.newUnsignedTypedMessage(
            messageParamsMock,
            requestMock,
            versionMock,
          ),
      );
      expect(error instanceof EthereumProviderError).toBe(true);
      expect(error.message).toBe('User rejected the request.');
    });

    it('throws if cannot get signature', async () => {
      keyringControllerMock.signTypedMessage.mockRejectedValueOnce(
        keyringErrorMock,
      );
      typedMessageManagerMock.addUnapprovedMessage.mockResolvedValue(
        messageIdMock,
      );
      const error: any = await getError(
        async () =>
          await signatureController.newUnsignedTypedMessage(
            messageParamsMock,
            requestMock,
            versionMock,
          ),
      );
      expect(error.message).toBe(keyringErrorMessageMock);
      expect(
        typedMessageManagerMock.setMessageStatusErrored,
      ).toHaveBeenCalledTimes(1);
      expect(
        typedMessageManagerMock.setMessageStatusErrored,
      ).toHaveBeenCalledWith(messageIdMock, keyringErrorMessageMock);
    });
  });

  describe('setPersonalMessageInProgress', () => {
    it('calls the message manager', async () => {
      signatureController.setPersonalMessageInProgress(
        messageParamsMock.metamaskId,
      );

      expect(
        personalMessageManagerMock.setMessageStatusInProgress,
      ).toHaveBeenCalledTimes(1);
    });
  });

  describe('setTypedMessageInProgress', () => {
    it('calls the message manager', async () => {
      signatureController.setTypedMessageInProgress(
        messageParamsMock.metamaskId,
      );

      expect(
        typedMessageManagerMock.setMessageStatusInProgress,
      ).toHaveBeenCalledTimes(1);
    });
  });

  describe('message manager events', () => {
    it.each([
      ['message manager', messageManagerMock],
      ['personal message manager', personalMessageManagerMock],
      ['typed message manager', typedMessageManagerMock],
    ])('bubbles update badge event from %s', (_, messageManager) => {
      const mockListener = jest.fn();
      const mockHub = messageManager.hub.on as jest.Mock;

      signatureController.hub.on('updateBadge', mockListener);
      mockHub.mock.calls[0][1]();

      expect(mockListener).toHaveBeenCalledTimes(1);
    });

    // eslint-disable-next-line jest/expect-expect
    it('does not throw if approval request promise throws', async () => {
      const mockHub = messageManagerMock.hub.on as jest.Mock;

      messengerMock.call.mockRejectedValueOnce('Test Error');

      mockHub.mock.calls[1][1](messageParamsMock);
    });

    it('updates state on message manager state change', async () => {
      await messageManagerMock.subscribe.mock.calls[0][0]({
        unapprovedMessages: { [messageIdMock]: coreMessageMock as any },
        unapprovedMessagesCount: 3,
      });

      expect(await signatureController.state).toStrictEqual({
        unapprovedMsgs: { [messageIdMock]: stateMessageMock as any },
        unapprovedPersonalMsgs: {},
        unapprovedTypedMessages: {},
        unapprovedMsgCount: 3,
        unapprovedPersonalMsgCount: 0,
        unapprovedTypedMessagesCount: 0,
      });
    });

    it('updates state on personal message manager state change', async () => {
      await personalMessageManagerMock.subscribe.mock.calls[0][0]({
        unapprovedMessages: { [messageIdMock]: coreMessageMock as any },
        unapprovedMessagesCount: 4,
      });

      expect(await signatureController.state).toStrictEqual({
        unapprovedMsgs: {},
        unapprovedPersonalMsgs: { [messageIdMock]: stateMessageMock as any },
        unapprovedTypedMessages: {},
        unapprovedMsgCount: 0,
        unapprovedPersonalMsgCount: 4,
        unapprovedTypedMessagesCount: 0,
      });
    });

    it('updates state on typed message manager state change', async () => {
      await typedMessageManagerMock.subscribe.mock.calls[0][0]({
        unapprovedMessages: { [messageIdMock]: coreMessageMock as any },
        unapprovedMessagesCount: 5,
      });

      expect(await signatureController.state).toStrictEqual({
        unapprovedMsgs: {},
        unapprovedPersonalMsgs: {},
        unapprovedTypedMessages: { [messageIdMock]: stateMessageMock as any },
        unapprovedMsgCount: 0,
        unapprovedPersonalMsgCount: 0,
        unapprovedTypedMessagesCount: 5,
      });
    });
  });
});
