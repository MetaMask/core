import {
  MessageManager,
  PersonalMessageManager,
  TypedMessageManager,
  AbstractMessage,
  OriginalRequest,
} from '@metamask/message-manager';
import { ORIGIN_METAMASK } from '@metamask/controller-utils';
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

const messageIdMock = '123';
const messageIdMock2 = '456';
const versionMock = '1';
const signatureMock = '0xAABBCC';
const stateMock = { test: 123 };

const messageParamsMock = {
  from: '0x123',
  origin: 'http://test.com',
  data: '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
  metamaskId: messageIdMock,
  version: 'V1',
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

const createMessageManagerMock = <T>(prototype?: any): jest.Mocked<T> => {
  const messageManagerMock = Object.create(prototype);

  return Object.assign(messageManagerMock, {
    getUnapprovedMessages: jest.fn(),
    getUnapprovedMessagesCount: jest.fn(),
    addUnapprovedMessageAsync: jest.fn(),
    approveMessage: jest.fn(),
    setMessageStatusSigned: jest.fn(),
    setMessageStatusErrored: jest.fn(),
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

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, 'info').mockImplementation(() => undefined);

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
      await signatureController.newUnsignedMessage(
        messageParamsMock,
        requestMock,
      );

      expect(
        messageManagerMock.addUnapprovedMessageAsync,
      ).toHaveBeenCalledTimes(1);
      expect(messageManagerMock.addUnapprovedMessageAsync).toHaveBeenCalledWith(
        messageParamsMock,
        requestMock,
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
        personalMessageManagerMock.addUnapprovedMessageAsync,
      ).toHaveBeenCalledTimes(1);

      expect(
        personalMessageManagerMock.addUnapprovedMessageAsync,
      ).toHaveBeenCalledWith(
        expect.objectContaining(messageParamsMock),
        requestMock,
      );
    });
  });

  describe('newUnsignedTypedMessage', () => {
    it('adds message to typed message manager', async () => {
      signatureController.newUnsignedTypedMessage(
        messageParamsMock,
        requestMock,
        versionMock,
      );

      expect(
        typedMessageManagerMock.addUnapprovedMessageAsync,
      ).toHaveBeenCalledTimes(1);
      expect(
        typedMessageManagerMock.addUnapprovedMessageAsync,
      ).toHaveBeenCalledWith(messageParamsMock, versionMock, requestMock);
    });
  });

  describe.each([
    [
      'signMessage',
      messageManagerMock,
      () => signatureController.signMessage,
      () => keyringControllerMock.signMessage,
    ],
    [
      'signPersonalMessage',
      personalMessageManagerMock,
      () => signatureController.signPersonalMessage,
      () => keyringControllerMock.signPersonalMessage,
    ],
    [
      'signTypedMessage',
      typedMessageManagerMock,
      () => signatureController.signTypedMessage,
      () => keyringControllerMock.signTypedMessage,
    ],
  ])(
    '%s',
    (
      signMethodName,
      messageManager,
      getSignatureControllerMethod,
      getKeyringControllerMethod,
    ) => {
      let signatureControllerMethod: (...args: any[]) => Promise<string>;
      let keyringControllerMethod: jest.Mock;

      // eslint-disable-next-line jest/no-duplicate-hooks
      beforeEach(() => {
        messageManager.approveMessage.mockResolvedValueOnce(messageParamsMock2);

        (keyringControllerMock as any)[signMethodName].mockResolvedValueOnce(
          signatureMock,
        );

        signatureControllerMethod =
          getSignatureControllerMethod().bind(signatureController);
        keyringControllerMethod = getKeyringControllerMethod();
      });

      it('approves message and signs', async () => {
        await (signatureController as any)[signMethodName](messageParamsMock);

        const keyringControllerExtraArgs =
          // eslint-disable-next-line jest/no-if
          signMethodName === 'signTypedMessage'
            ? [{ version: messageParamsMock.version }]
            : [];

        expect(keyringControllerMethod).toHaveBeenCalledTimes(1);
        expect(keyringControllerMethod).toHaveBeenCalledWith(
          messageParamsMock2,
          ...keyringControllerExtraArgs,
        );

        expect(messageManager.setMessageStatusSigned).toHaveBeenCalledTimes(1);
        expect(messageManager.setMessageStatusSigned).toHaveBeenCalledWith(
          messageParamsMock2.metamaskId,
          signatureMock,
        );
      });

      it('returns current state', async () => {
        getAllStateMock.mockReturnValueOnce(stateMock);
        expect(
          await signatureControllerMethod(messageParamsMock),
        ).toStrictEqual(stateMock);
      });

      it('accepts approval', async () => {
        await signatureControllerMethod(messageParamsMock);

        expect(messengerMock.call).toHaveBeenCalledTimes(1);
        expect(messengerMock.call).toHaveBeenCalledWith(
          'ApprovalController:acceptRequest',
          messageParamsMock.metamaskId,
        );
      });

      it('rejects approval on error', async () => {
        keyringControllerMethod.mockReset();
        keyringControllerMethod.mockRejectedValue(new Error('Test Error'));

        await expect(
          signatureControllerMethod(messageParamsMock),
        ).rejects.toThrow('Test Error');

        expect(messengerMock.call).toHaveBeenCalledTimes(1);
        expect(messengerMock.call).toHaveBeenCalledWith(
          'ApprovalController:rejectRequest',
          messageParamsMock.metamaskId,
          'Cancel',
        );
      });

      if (signMethodName === 'signTypedMessage') {
        it('parses JSON string in data if not V1', async () => {
          const jsonData = { test: 'value' };

          messageManager.approveMessage.mockReset();
          messageManager.approveMessage.mockResolvedValueOnce({
            ...messageParamsMock2,
            data: JSON.stringify(jsonData),
          });

          await signatureControllerMethod({
            ...messageParamsMock,
            version: 'V2',
          });

          expect(keyringControllerMethod).toHaveBeenCalledTimes(1);
          expect(keyringControllerMethod).toHaveBeenCalledWith(
            { ...messageParamsMock2, data: jsonData },
            { version: 'V2' },
          );
        });

        it('does not parse JSON string in data if not V1 and option disabled', async () => {
          const jsonString = JSON.stringify({ test: 'value' });

          messageManager.approveMessage.mockReset();
          messageManager.approveMessage.mockResolvedValueOnce({
            ...messageParamsMock2,
            data: jsonString,
          });

          await signatureControllerMethod(
            {
              ...messageParamsMock,
              version: 'V2',
            },
            { parseJsonData: false },
          );

          expect(keyringControllerMethod).toHaveBeenCalledTimes(1);
          expect(keyringControllerMethod).toHaveBeenCalledWith(
            { ...messageParamsMock2, data: jsonString },
            { version: 'V2' },
          );
        });

        it('supports JSON object if not V1', async () => {
          const jsonData = [{ test: 'value' }];

          const typedMessageManager =
            messageManager as jest.Mocked<TypedMessageManager>;

          typedMessageManager.approveMessage.mockReset();
          typedMessageManager.approveMessage.mockResolvedValueOnce({
            ...messageParamsMock2,
            data: jsonData,
          });

          await signatureControllerMethod({
            ...messageParamsMock,
            version: 'V2',
          });

          expect(keyringControllerMethod).toHaveBeenCalledTimes(1);
          expect(keyringControllerMethod).toHaveBeenCalledWith(
            { ...messageParamsMock2, data: jsonData },
            { version: 'V2' },
          );
        });

        it('sets errored status on error', async () => {
          const typedMessageManager =
            messageManager as jest.Mocked<TypedMessageManager>;

          keyringControllerMethod.mockReset();
          keyringControllerMethod.mockRejectedValue(new Error('Test Error'));

          await expect(
            signatureControllerMethod(messageParamsMock),
          ).rejects.toThrow('Test Error');

          expect(
            typedMessageManager.setMessageStatusErrored,
          ).toHaveBeenCalledTimes(1);
          expect(
            typedMessageManager.setMessageStatusErrored,
          ).toHaveBeenCalledWith(messageParamsMock.metamaskId, 'Test Error');
        });
      } else {
        it('rejects message on error', async () => {
          keyringControllerMethod.mockReset();
          keyringControllerMethod.mockRejectedValue(new Error('Test Error'));

          await expect(
            signatureControllerMethod(messageParamsMock),
          ).rejects.toThrow('Test Error');

          expect(messageManager.rejectMessage).toHaveBeenCalledTimes(1);
          expect(messageManager.rejectMessage).toHaveBeenCalledWith(
            messageParamsMock.metamaskId,
          );
        });
      }
    },
  );

  describe.each([
    [
      'cancelMessage',
      messageManagerMock,
      (msgId: string) => signatureController.cancelMessage(msgId),
    ],
    [
      'cancelPersonalMessage',
      personalMessageManagerMock,
      (msgId: string) => signatureController.cancelPersonalMessage(msgId),
    ],
    [
      'cancelTypedMessage',
      typedMessageManagerMock,
      (msgId: string) => signatureController.cancelTypedMessage(msgId),
    ],
  ])('%s', (_cancelMethodName, messageManager, cancelMethod) => {
    it('rejects message using message manager', async () => {
      cancelMethod(messageIdMock);

      expect(messageManager.rejectMessage).toHaveBeenCalledTimes(1);
      expect(messageManager.rejectMessage).toHaveBeenCalledWith(
        messageParamsMock.metamaskId,
      );
    });

    it('rejects approval using approval controller', async () => {
      cancelMethod(messageIdMock);

      expect(messengerMock.call).toHaveBeenCalledTimes(1);
      expect(messengerMock.call).toHaveBeenCalledWith(
        'ApprovalController:rejectRequest',
        messageParamsMock.metamaskId,
        'Cancel',
      );
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

    it.each([
      ['message manager', messageManagerMock, 'eth_sign'],
      ['personal message manager', personalMessageManagerMock, 'personal_sign'],
      ['typed message manager', typedMessageManagerMock, 'eth_signTypedData'],
    ])(
      'requires approval on unapproved message event from %s',
      (_, messageManager, methodName) => {
        const mockHub = messageManager.hub.on as jest.Mock;

        messengerMock.call.mockResolvedValueOnce({});

        mockHub.mock.calls[1][1](messageParamsMock);

        expect(messengerMock.call).toHaveBeenCalledTimes(1);
        expect(messengerMock.call).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            id: messageIdMock,
            origin: messageParamsMock.origin,
            type: methodName,
          },
          true,
        );
      },
    );

    it.each([
      ['message manager', messageManagerMock, 'eth_sign'],
      ['personal message manager', personalMessageManagerMock, 'personal_sign'],
      ['typed message manager', typedMessageManagerMock, 'eth_signTypedData'],
    ])(
      'requires approval on unapproved message event from %s with internal origin',
      (_, messageManager, methodName) => {
        const mockHub = messageManager.hub.on as jest.Mock;

        messengerMock.call.mockResolvedValueOnce({});

        mockHub.mock.calls[1][1]({ ...messageParamsMock, origin: undefined });

        expect(messengerMock.call).toHaveBeenCalledTimes(1);
        expect(messengerMock.call).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            id: messageIdMock,
            origin: ORIGIN_METAMASK,
            type: methodName,
          },
          true,
        );
      },
    );

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
