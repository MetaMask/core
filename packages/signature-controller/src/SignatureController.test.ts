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
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    registerInitialEventPayload: jest.fn(),
    publish: jest.fn(),
    call: jest.fn(),
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as jest.Mocked<SignatureControllerMessenger>);

const addUnapprovedMessageMock = jest.fn();
const waitForFinishStatusMock = jest.fn();
const approveMessageMock = jest.fn();

// TODO: Replace `any` with type
// TODO: Either fix this lint violation or explain why it's necessary to ignore.
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/naming-convention
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

  const personalMessageManagerConstructorMock =
    PersonalMessageManager as jest.MockedClass<typeof PersonalMessageManager>;
  const typedMessageManagerConstructorMock =
    TypedMessageManager as jest.MockedClass<typeof TypedMessageManager>;

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
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        unapprovedPersonalMsgs: { [messageIdMock]: messageMock } as any,
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        unapprovedTypedMessages: { [messageIdMock]: messageMock } as any,
        unapprovedPersonalMsgCount: 2,
        unapprovedTypedMessagesCount: 3,
      }));

      signatureController.resetState();

      expect(signatureController.state).toStrictEqual({
        unapprovedPersonalMsgs: {},
        unapprovedTypedMessages: {},
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

      personalMessageManagerMock.getUnapprovedMessages.mockReturnValueOnce(
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages as any,
      );
      typedMessageManagerMock.getUnapprovedMessages.mockReturnValueOnce(
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages as any,
      );

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      signatureController.update(() => ({
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        unapprovedMsgs: messages as any,
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        unapprovedPersonalMsgs: messages as any,
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        unapprovedTypedMessages: messages as any,
      }));
    });

    it('rejects all messages in all message managers', () => {
      signatureController.rejectUnapproved('Test Reason');

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

      expect(listenerMock).toHaveBeenCalledTimes(4);
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

      expect(personalMessageManagerMock.update).toHaveBeenCalledTimes(1);
      expect(personalMessageManagerMock.update).toHaveBeenCalledWith(
        defaultState,
      );

      expect(typedMessageManagerMock.update).toHaveBeenCalledTimes(1);
      expect(typedMessageManagerMock.update).toHaveBeenCalledWith(defaultState);
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
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      const messageParamsWithOriginUndefined = {
        ...messageParamsMock,
        origin: undefined,
      };
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      signatureController.update(() => ({
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        unapprovedTypedMessages: { [messageIdMock]: stateMessageMock } as any,
      }));

      await signatureController.newUnsignedTypedMessage(
        messageParamsWithOriginUndefined,
        requestMock,
        versionMock,
        { parseJsonData: false },
      );

      expect(
        typedMessageManagerMock.addUnapprovedMessage,
      ).toHaveBeenCalledTimes(1);
      expect(typedMessageManagerMock.addUnapprovedMessage).toHaveBeenCalledWith(
        messageParamsWithOriginUndefined,
        requestMock,
        versionMock,
      );

      expect(messengerMock.call).toHaveBeenCalledTimes(4);
      expect(messengerMock.call).toHaveBeenNthCalledWith(
        2,
        'ApprovalController:addRequest',
        {
          id: messageIdMock,
          origin: ORIGIN_METAMASK,
          type: 'eth_signTypedData',
          requestData: messageParamsWithOriginUndefined,
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
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      expect(personalMessageManagerMock.setMetadata).toHaveBeenCalledTimes(1);
      expect(personalMessageManagerMock.setMetadata).toHaveBeenCalledWith(
        messageIdMock,
        messageParamsWithoutIdMock.data,
      );
      expect(typedMessageManagerMock.setMetadata).not.toHaveBeenCalled();
    });

    it('should return false when an error occurs', () => {
      jest
        .spyOn(personalMessageManagerMock, 'setMetadata')
        .mockImplementation(() => {
          throw new Error('mocked error');
        });

      const result = signatureController.setMessageMetadata(
        messageParamsMock.metamaskId,
        messageParamsMock.data,
      );

      expect(result).toBeUndefined();
      expect(personalMessageManagerMock.setMetadata).toHaveBeenCalledTimes(1);
      expect(personalMessageManagerMock.setMetadata).toHaveBeenCalledWith(
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

      expect(
        personalMessageManagerMock.setMessageStatusSigned,
      ).toHaveBeenCalledTimes(1);
      expect(
        personalMessageManagerMock.setMessageStatusSigned,
      ).toHaveBeenCalledWith(messageIdMock, messageParamsWithoutIdMock.data);
      expect(
        typedMessageManagerMock.setMessageStatusSigned,
      ).not.toHaveBeenCalled();
    });

    it('should return undefined when an error occurs', () => {
      jest
        .spyOn(personalMessageManagerMock, 'setMessageStatusSigned')
        .mockImplementation(() => {
          throw new Error('mocked error');
        });

      const result = signatureController.setDeferredSignSuccess(
        messageParamsMock.metamaskId,
        messageParamsMock.data,
      );

      expect(result).toBeUndefined();
      expect(
        personalMessageManagerMock.setMessageStatusSigned,
      ).toHaveBeenCalledTimes(1);
      expect(
        personalMessageManagerMock.setMessageStatusSigned,
      ).toHaveBeenCalledWith(messageIdMock, messageParamsWithoutIdMock.data);
    });
  });

  describe('trySetDeferredSignError', () => {
    it('rejects a message by calling rejectMessage', () => {
      signatureController.setDeferredSignError(messageParamsMock.metamaskId);

      expect(personalMessageManagerMock.rejectMessage).toHaveBeenCalledTimes(1);
      expect(personalMessageManagerMock.rejectMessage).toHaveBeenCalledWith(
        messageIdMock,
      );

      expect(typedMessageManagerMock.rejectMessage).not.toHaveBeenCalled();
    });

    it('rejects message on next message manager if first throws', () => {
      jest
        .spyOn(personalMessageManagerMock, 'rejectMessage')
        .mockImplementation(() => {
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

    it('returns all the messages from TypedMessageManager and PersonalMessageManager', () => {
      typedMessageManagerMock.getAllMessages.mockReturnValueOnce(message);
      personalMessageManagerMock.getAllMessages.mockReturnValueOnce([]);
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
      const mockHub = personalMessageManagerMock.hub.on as jest.Mock;

      messengerMock.call.mockRejectedValueOnce('Test Error');

      mockHub.mock.calls[1][1](messageParamsMock);
    });

    it('updates state on message manager state change', async () => {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/await-thenable
      await personalMessageManagerMock.subscribe.mock.calls[0][0]({
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        unapprovedMessages: { [messageIdMock]: coreMessageMock as any },
        unapprovedMessagesCount: 3,
      });

      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/await-thenable
      expect(await signatureController.state).toStrictEqual({
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        unapprovedPersonalMsgs: { [messageIdMock]: stateMessageMock as any },
        unapprovedTypedMessages: {},
        unapprovedPersonalMsgCount: 3,
        unapprovedTypedMessagesCount: 0,
      });
    });

    it('updates state on personal message manager state change', async () => {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/await-thenable
      await personalMessageManagerMock.subscribe.mock.calls[0][0]({
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        unapprovedMessages: { [messageIdMock]: coreMessageMock as any },
        unapprovedMessagesCount: 4,
      });

      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/await-thenable
      expect(await signatureController.state).toStrictEqual({
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        unapprovedPersonalMsgs: { [messageIdMock]: stateMessageMock as any },
        unapprovedTypedMessages: {},
        unapprovedPersonalMsgCount: 4,
        unapprovedTypedMessagesCount: 0,
      });
    });

    it('updates state on typed message manager state change', async () => {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/await-thenable
      await typedMessageManagerMock.subscribe.mock.calls[0][0]({
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        unapprovedMessages: { [messageIdMock]: coreMessageMock as any },
        unapprovedMessagesCount: 5,
      });

      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/await-thenable
      expect(await signatureController.state).toStrictEqual({
        unapprovedPersonalMsgs: {},
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        unapprovedTypedMessages: { [messageIdMock]: stateMessageMock as any },
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
