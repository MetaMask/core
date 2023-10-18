import { ORIGIN_METAMASK } from '@metamask/controller-utils';
import {
  SigningMethod,
  SigningStage,
  LogType,
} from '@metamask/logging-controller';
import type {
  AbstractMessage,
  OriginalRequest,
} from '@metamask/message-manager';
import {
  MessageManager,
  PersonalMessageManager,
  TypedMessageManager,
} from '@metamask/message-manager';
import { EthereumProviderError } from '@metamask/rpc-errors';

import type {
  SignatureControllerMessenger,
  SignatureControllerOptions,
} from './SignatureController';
import { SignatureController } from './SignatureController';

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
    cancelAbstractMessage: jest.fn(),
    subscribe: jest.fn(),
    update: jest.fn(),
    setMetadata: jest.fn(),
    getAllMessages: jest.fn(),
    hub: {
      on: jest.fn(),
    },
  }) as jest.Mocked<T>;
};

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
  const resultCallbacksMock = {
    success: jest.fn(),
    error: jest.fn(),
  };
  const messengerMock = createMessengerMock();
  const getAllStateMock = jest.fn();
  const securityProviderRequestMock = jest.fn();
  const isEthSignEnabledMock = jest.fn();
  const getCurrentChainIdMock = jest.fn();
  const keyringErrorMessageMock = 'Keyring Error';
  const keyringErrorMock = new Error(keyringErrorMessageMock);

  const mockMessengerAction = (
    action: string,
    callback: (actionName: string, ...args: any[]) => any,
  ) => {
    messengerMock.call.mockImplementation((actionName, ...rest) => {
      if (actionName === action) {
        return callback(actionName, ...rest);
      }

      return Promise.resolve({
        resultCallbacks: resultCallbacksMock,
      });
    });
  };

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, 'info').mockImplementation(() => undefined);

    addUnapprovedMessageMock.mockResolvedValue(messageIdMock);
    approveMessageMock.mockResolvedValue(messageParamsWithoutIdMock);
    messageManagerConstructorMock.mockReturnValue(messageManagerMock);
    personalMessageManagerConstructorMock.mockReturnValue(
      personalMessageManagerMock,
    );
    messengerMock.call.mockResolvedValue({
      resultCallbacks: resultCallbacksMock,
    });

    typedMessageManagerConstructorMock.mockReturnValue(typedMessageManagerMock);

    isEthSignEnabledMock.mockReturnValue(true);

    signatureController = new SignatureController({
      messenger: messengerMock,
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

      expect(messengerMock.call).toHaveBeenCalledTimes(4);
      expect(messengerMock.call).toHaveBeenNthCalledWith(
        2,
        'ApprovalController:addRequest',
        {
          id: messageIdMock,
          origin: ORIGIN_METAMASK,
          type: 'eth_sign',
          requestData: messageParamsWithoutOrigin,
          expectsResult: true,
        },
        true,
      );
    });

    it('throws if cannot get signature', async () => {
      mockMessengerAction('KeyringController:signMessage', async () => {
        throw keyringErrorMock;
      });
      const listenerMock = jest.fn();
      signatureController.hub.on(`${messageIdMock}:signError`, listenerMock);

      const error: any = await getError(
        async () =>
          await signatureController.newUnsignedMessage(
            messageParamsMock,
            requestMock,
          ),
      );

      expect(listenerMock).toHaveBeenCalledTimes(1);
      expect(listenerMock).toHaveBeenCalledWith({
        error,
      });
      expect(messengerMock.call).toHaveBeenCalledTimes(3);
      expect(error.message).toBe(keyringErrorMessageMock);
      expect(messageManagerMock.rejectMessage).toHaveBeenCalledTimes(1);
      expect(messageManagerMock.rejectMessage).toHaveBeenCalledWith(
        messageIdMock,
      );
    });

    it('calls success callback once message is signed', async () => {
      const { origin: _origin, ...messageParamsWithoutOrigin } =
        messageParamsMock;

      await signatureController.newUnsignedMessage(
        messageParamsWithoutOrigin,
        requestMock,
      );

      expect(resultCallbacksMock.success).toHaveBeenCalledTimes(1);
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

      expect(messengerMock.call).toHaveBeenCalledTimes(4);
      expect(messengerMock.call).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
        {
          id: messageIdMock,
          origin: messageParamsMock.origin,
          type: 'personal_sign',
          requestData: messageParamsMock,
          expectsResult: true,
        },
        true,
      );
      expect(messengerMock.call).toHaveBeenNthCalledWith(
        3,
        'KeyringController:signPersonalMessage',
        messageParamsWithoutIdMock,
      );
    });

    it('throws if approval rejected', async () => {
      messengerMock.call
        .mockResolvedValueOnce({}) // LoggerController:add
        .mockRejectedValueOnce({}); // ApprovalController:addRequest
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
      mockMessengerAction('KeyringController:signPersonalMessage', async () => {
        throw keyringErrorMock;
      });

      const error: any = await getError(
        async () =>
          await signatureController.newUnsignedPersonalMessage(
            messageParamsMock,
            requestMock,
          ),
      );

      expect(messengerMock.call).toHaveBeenCalledTimes(3);
      expect(error.message).toBe(keyringErrorMessageMock);
      expect(messengerMock.call).toHaveBeenNthCalledWith(
        3,
        'KeyringController:signPersonalMessage',
        messageParamsWithoutIdMock,
      );
      expect(personalMessageManagerMock.rejectMessage).toHaveBeenCalledTimes(1);
      expect(personalMessageManagerMock.rejectMessage).toHaveBeenCalledWith(
        messageIdMock,
      );
    });

    it('calls success callback once message is signed', async () => {
      await signatureController.newUnsignedPersonalMessage(
        messageParamsMock,
        requestMock,
      );

      expect(resultCallbacksMock.success).toHaveBeenCalledTimes(1);
    });
  });

  describe('newUnsignedTypedMessage', () => {
    it('adds message to typed message manager', async () => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      signatureController.update(() => ({
        unapprovedTypedMessages: { [messageIdMock]: stateMessageMock } as any,
      }));

      await signatureController.newUnsignedTypedMessage(
        messageParamsMock,
        requestMock,
        versionMock,
        { parseJsonData: false },
      );

      expect(
        typedMessageManagerMock.addUnapprovedMessage,
      ).toHaveBeenCalledTimes(1);
      expect(typedMessageManagerMock.addUnapprovedMessage).toHaveBeenCalledWith(
        messageParamsMock,
        requestMock,
        versionMock,
      );

      expect(messengerMock.call).toHaveBeenCalledTimes(4);
      expect(messengerMock.call).toHaveBeenNthCalledWith(
        2,
        'ApprovalController:addRequest',
        {
          id: messageIdMock,
          origin: messageParamsMock.origin,
          type: 'eth_signTypedData',
          requestData: messageParamsMock,
          expectsResult: true,
        },
        true,
      );
      expect(messengerMock.call).toHaveBeenNthCalledWith(
        3,
        'KeyringController:signTypedMessage',
        messageParamsWithoutIdMock,
        versionMock,
      );
    });

    it('does not set as signed, messages with deferSetAsSigned', async () => {
      const deferredMessageParams = {
        ...messageParamsMock,
        deferSetAsSigned: true,
      };
      typedMessageManagerMock.approveMessage.mockReset();
      typedMessageManagerMock.approveMessage.mockResolvedValueOnce(
        deferredMessageParams,
      );

      await signatureController.newUnsignedTypedMessage(
        messageParamsMock,
        requestMock,
        versionMock,
        { parseJsonData: false },
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
        { parseJsonData: true },
      );

      expect(messengerMock.call).toHaveBeenNthCalledWith(
        3,
        'KeyringController:signTypedMessage',
        { ...messageParamsMock2, data: jsonData, deferSetAsSigned: false },
        'V2',
      );
    });

    it('throws if approval rejected', async () => {
      messengerMock.call
        .mockResolvedValueOnce({}) // LoggerController:add
        .mockRejectedValueOnce({}); // ApprovalController:addRequest
      const error: any = await getError(
        async () =>
          await signatureController.newUnsignedTypedMessage(
            messageParamsMock,
            requestMock,
            versionMock,
            { parseJsonData: true },
          ),
      );
      expect(error instanceof EthereumProviderError).toBe(true);
      expect(error.message).toBe('User rejected the request.');
    });

    it('throws if cannot get signature', async () => {
      mockMessengerAction('KeyringController:signTypedMessage', async () => {
        throw keyringErrorMock;
      });
      typedMessageManagerMock.addUnapprovedMessage.mockResolvedValue(
        messageIdMock,
      );
      const error: any = await getError(
        async () =>
          await signatureController.newUnsignedTypedMessage(
            messageParamsMock,
            requestMock,
            versionMock,
            { parseJsonData: true },
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

    it('calls success callback once message is signed', async () => {
      await signatureController.newUnsignedTypedMessage(
        messageParamsMock,
        requestMock,
        versionMock,
        { parseJsonData: false },
      );

      expect(resultCallbacksMock.success).toHaveBeenCalledTimes(1);
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

  describe('trySetMessageMetadata', () => {
    it('sets the metadata in a message manager', () => {
      signatureController.setMessageMetadata(
        messageParamsMock.metamaskId,
        messageParamsMock.data,
      );

      expect(messageManagerMock.setMetadata).toHaveBeenCalledTimes(1);
      expect(messageManagerMock.setMetadata).toHaveBeenCalledWith(
        messageIdMock,
        messageParamsWithoutIdMock.data,
      );

      expect(personalMessageManagerMock.setMetadata).not.toHaveBeenCalled();
      expect(typedMessageManagerMock.setMetadata).not.toHaveBeenCalled();
    });

    it('should return false when an error occurs', () => {
      jest.spyOn(messageManagerMock, 'setMetadata').mockImplementation(() => {
        throw new Error('mocked error');
      });

      const result = signatureController.setMessageMetadata(
        messageParamsMock.metamaskId,
        messageParamsMock.data,
      );

      expect(result).toBeUndefined();
      expect(messageManagerMock.setMetadata).toHaveBeenCalledTimes(1);
      expect(messageManagerMock.setMetadata).toHaveBeenCalledWith(
        messageIdMock,
        messageParamsWithoutIdMock.data,
      );
    });
  });

  describe('setDeferredSignSuccess', () => {
    it('sets a message status as signed in a message manager', () => {
      signatureController.setDeferredSignSuccess(
        messageParamsMock.metamaskId,
        messageParamsMock.data,
      );

      expect(messageManagerMock.setMessageStatusSigned).toHaveBeenCalledTimes(
        1,
      );
      expect(messageManagerMock.setMessageStatusSigned).toHaveBeenCalledWith(
        messageIdMock,
        messageParamsWithoutIdMock.data,
      );

      expect(
        personalMessageManagerMock.setMessageStatusSigned,
      ).not.toHaveBeenCalled();
      expect(
        typedMessageManagerMock.setMessageStatusSigned,
      ).not.toHaveBeenCalled();
    });

    it('should return false when an error occurs', () => {
      jest
        .spyOn(messageManagerMock, 'setMessageStatusSigned')
        .mockImplementation(() => {
          throw new Error('mocked error');
        });

      const result = signatureController.setDeferredSignSuccess(
        messageParamsMock.metamaskId,
        messageParamsMock.data,
      );

      expect(result).toBeUndefined();
      expect(messageManagerMock.setMessageStatusSigned).toHaveBeenCalledTimes(
        1,
      );
      expect(messageManagerMock.setMessageStatusSigned).toHaveBeenCalledWith(
        messageIdMock,
        messageParamsWithoutIdMock.data,
      );
    });
  });

  describe('trySetDeferredSignError', () => {
    it('rejects a message by calling rejectMessage', () => {
      signatureController.setDeferredSignError(messageParamsMock.metamaskId);

      expect(messageManagerMock.rejectMessage).toHaveBeenCalledTimes(1);
      expect(messageManagerMock.rejectMessage).toHaveBeenCalledWith(
        messageIdMock,
      );

      expect(personalMessageManagerMock.rejectMessage).not.toHaveBeenCalled();
      expect(typedMessageManagerMock.rejectMessage).not.toHaveBeenCalled();
    });

    it('rejects message on next message manager if first throws', () => {
      jest.spyOn(messageManagerMock, 'rejectMessage').mockImplementation(() => {
        throw new Error('mocked error');
      });
      jest
        .spyOn(personalMessageManagerMock, 'rejectMessage')
        .mockImplementation(() => {
          throw new Error('mocked error');
        });

      expect(() =>
        signatureController.setDeferredSignError(messageParamsMock.metamaskId),
      ).not.toThrow();
    });

    it('should throw an error when tryForEachMessageManager fails', () => {
      jest.spyOn(messageManagerMock, 'rejectMessage').mockImplementation(() => {
        throw new Error('mocked error');
      });
      jest
        .spyOn(personalMessageManagerMock, 'rejectMessage')
        .mockImplementation(() => {
          throw new Error('mocked error');
        });
      jest
        .spyOn(typedMessageManagerMock, 'rejectMessage')
        .mockImplementation(() => {
          throw new Error('mocked error');
        });

      expect(() =>
        signatureController.setDeferredSignError(messageParamsMock.metamaskId),
      ).toThrow('Message not found');
    });
  });

  describe('messages getter', () => {
    const message = [
      {
        name: 'some message',
        type: 'type',
        value: 'value',
        messageParams: {
          data: [],
          from: '0x0123',
        },
        time: 1,
        status: '',
        id: '1',
      },
    ];

    it('returns all the messages from typed, personal and messageManager', () => {
      typedMessageManagerMock.getAllMessages.mockReturnValueOnce(message);
      personalMessageManagerMock.getAllMessages.mockReturnValueOnce([]);
      messageManagerMock.getAllMessages.mockReturnValueOnce([]);
      expect(signatureController.messages).toMatchObject({
        '1': {
          id: '1',
          messageParams: {
            data: [],
            from: '0x0123',
          },
          name: 'some message',
          status: '',
          time: 1,
          type: 'type',
          value: 'value',
        },
      });
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

  describe('logging controller events', () => {
    it('sends proposed sign log event after approval is shown', async () => {
      const testVersion = 'V1';
      await signatureController.newUnsignedTypedMessage(
        messageParamsMock,
        requestMock,
        testVersion,
        { parseJsonData: false },
      );

      expect(messengerMock.call).toHaveBeenNthCalledWith(
        1,
        'LoggingController:add',
        {
          type: LogType.EthSignLog,
          data: {
            signingMethod: SigningMethod.EthSignTypedData,
            stage: SigningStage.Proposed,
            signingData: expect.objectContaining({
              version: testVersion,
              from: messageParamsMock.from,
              data: messageParamsMock.data,
              origin: messageParamsMock.origin,
            }),
          },
        },
      );
    });

    it('sends rejected sign log event if approval is rejected', async () => {
      const testVersion = 'V3';
      messengerMock.call
        .mockResolvedValueOnce({}) // LoggerController:add
        .mockRejectedValueOnce({}); // ApprovalController:addRequest
      await getError(
        async () =>
          await signatureController.newUnsignedTypedMessage(
            messageParamsMock,
            requestMock,
            testVersion,
            { parseJsonData: true },
          ),
      );
      expect(messengerMock.call).toHaveBeenNthCalledWith(
        3,
        'LoggingController:add',
        {
          type: LogType.EthSignLog,
          data: {
            signingMethod: SigningMethod.EthSignTypedDataV3,
            stage: SigningStage.Rejected,
            signingData: expect.objectContaining({
              version: testVersion,
              from: messageParamsMock.from,
              data: messageParamsMock.data,
              origin: messageParamsMock.origin,
            }),
          },
        },
      );
    });

    it('sends signed log event if signature operation is complete', async () => {
      const testVersion = 'V4';
      await signatureController.newUnsignedTypedMessage(
        messageParamsMock,
        requestMock,
        testVersion,
        { parseJsonData: false },
      );

      expect(messengerMock.call).toHaveBeenNthCalledWith(
        4,
        'LoggingController:add',
        {
          type: LogType.EthSignLog,
          data: {
            signingMethod: SigningMethod.EthSignTypedDataV4,
            stage: SigningStage.Signed,
            signingData: expect.objectContaining({
              version: testVersion,
              from: messageParamsMock.from,
              data: messageParamsMock.data,
              origin: messageParamsMock.origin,
            }),
          },
        },
      );
    });
  });
});
