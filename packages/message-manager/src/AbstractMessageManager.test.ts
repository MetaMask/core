import { ApprovalType } from '@metamask/controller-utils';

import type {
  MessageParams,
  OriginalRequest,
  SecurityProviderRequest,
} from './AbstractMessageManager';
import { AbstractMessageManager } from './AbstractMessageManager';
import type {
  TypedMessage,
  TypedMessageParams,
  TypedMessageParamsMetamask,
} from './TypedMessageManager';

class AbstractTestManager extends AbstractMessageManager<
  TypedMessage,
  TypedMessageParams,
  TypedMessageParamsMetamask
> {
  addRequestToMessageParams(
    messageParams: MessageParams,
    req?: OriginalRequest,
  ) {
    return super.addRequestToMessageParams(messageParams, req);
  }

  createUnapprovedMessage(
    messageParams: MessageParams,
    type: ApprovalType,
    req?: OriginalRequest,
  ) {
    return super.createUnapprovedMessage(messageParams, type, req);
  }

  prepMessageForSigning(
    messageParams: TypedMessageParamsMetamask,
  ): Promise<TypedMessageParams> {
    delete messageParams.metamaskId;
    delete messageParams.version;
    return Promise.resolve(messageParams);
  }

  setMessageStatus(messageId: string, status: string) {
    return super.setMessageStatus(messageId, status);
  }

  async addUnapprovedMessage(_messageParams: TypedMessageParamsMetamask) {
    return Promise.resolve('mocked');
  }
}
const typedMessage = [
  {
    name: 'Message',
    type: 'string',
    value: 'Hi, Alice!',
  },
  {
    name: 'A number',
    type: 'uint32',
    value: '1337',
  },
];
const messageId = '1';
const messageId2 = '2';
const from = '0x0123';
const messageTime = Date.now();
const messageStatus = 'unapproved';
const messageType = 'eth_signTypedData';
const messageData = typedMessage;
const rawSigMock = '0xsignaturemocked';
const messageIdMock = 'message-id-mocked';
const fromMock = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';

const mockSecurityProviderResponse = { flagAsDangerous: 2 };
const mockRequest = {
  origin: 'example.com',
  id: 123,
  securityAlertResponse: mockSecurityProviderResponse,
};
const mockMessageParams = { from, data: 'test' };

describe('AbstractTestManager', () => {
  it('should set default state', () => {
    const controller = new AbstractTestManager();
    expect(controller.state).toStrictEqual({
      unapprovedMessages: {},
      unapprovedMessagesCount: 0,
    });
  });

  it('should set default config', () => {
    const controller = new AbstractTestManager();
    expect(controller.config).toStrictEqual({});
  });

  it('should add a valid message', async () => {
    const controller = new AbstractTestManager();
    await controller.addMessage({
      id: messageId,
      messageParams: {
        data: typedMessage,
        from,
      },
      status: messageStatus,
      time: messageTime,
      type: messageType,
    });
    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.id).toBe(messageId);
    expect(message.messageParams.from).toBe(from);
    expect(message.messageParams.data).toBe(messageData);
    expect(message.time).toBe(messageTime);
    expect(message.status).toBe(messageStatus);
    expect(message.type).toBe(messageType);
  });

  it('should get all messages', async () => {
    const controller = new AbstractTestManager();
    const message = {
      id: messageId,
      messageParams: {
        data: typedMessage,
        from,
      },
      status: messageStatus,
      time: messageTime,
      type: messageType,
    };
    const message2 = {
      id: messageId2,
      messageParams: {
        data: typedMessage,
        from,
      },
      status: messageStatus,
      time: messageTime,
      type: messageType,
    };

    await controller.addMessage(message);
    await controller.addMessage(message2);
    const messages = controller.getAllMessages();
    expect(messages).toStrictEqual([message, message2]);
  });

  it('adds a valid message with provider security response', async () => {
    const securityProviderResponseMock = { flagAsDangerous: 2 };
    const securityProviderRequestMock: SecurityProviderRequest = jest
      .fn()
      .mockResolvedValue(securityProviderResponseMock);
    const controller = new AbstractTestManager(
      undefined,
      undefined,
      securityProviderRequestMock,
    );
    await controller.addMessage({
      id: messageId,
      messageParams: {
        data: typedMessage,
        from,
      },
      status: messageStatus,
      time: messageTime,
      type: messageType,
    });

    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.id).toBe(messageId);
    expect(message.messageParams.from).toBe(from);
    expect(message.messageParams.data).toBe(messageData);
    expect(message.time).toBe(messageTime);
    expect(message.status).toBe(messageStatus);
    expect(message.type).toBe(messageType);
    expect(securityProviderRequestMock).toHaveBeenCalled();
    expect(message).toHaveProperty('securityProviderResponse');
    expect(message.securityProviderResponse).toBe(securityProviderResponseMock);
  });

  it('should reject a message', async () => {
    const controller = new AbstractTestManager();
    await controller.addMessage({
      id: messageId,
      messageParams: {
        data: typedMessage,
        from,
      },
      status: messageStatus,
      time: messageTime,
      type: messageType,
    });
    controller.rejectMessage(messageId);
    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.status).toBe('rejected');
  });

  it('should sign a message', async () => {
    const controller = new AbstractTestManager();
    await controller.addMessage({
      id: messageId,
      messageParams: {
        data: typedMessage,
        from,
      },
      status: messageStatus,
      time: messageTime,
      type: messageType,
    });
    controller.setMessageStatusSigned(messageId, 'rawSig');
    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.status).toBe('signed');
    expect(message.rawSig).toBe('rawSig');
  });

  it('sets message to one of the allowed statuses', async () => {
    const controller = new AbstractTestManager(
      undefined,
      undefined,
      undefined,
      ['test-status'],
    );
    await controller.addMessage({
      id: messageId,
      messageParams: {
        data: typedMessage,
        from,
      },
      status: messageStatus,
      time: messageTime,
      type: messageType,
    });
    controller.setMessageStatusAndResult(messageId, 'rawSig', 'test-status');
    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.status).toBe('test-status');
  });

  it('should set a status to inProgress', async () => {
    const controller = new AbstractTestManager(
      undefined,
      undefined,
      undefined,
      ['test-status'],
    );
    await controller.addMessage({
      id: messageId,
      messageParams: {
        data: typedMessage,
        from,
      },
      status: messageStatus,
      time: messageTime,
      type: messageType,
    });
    controller.setMessageStatusInProgress(messageId);
    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.status).toBe('inProgress');
  });

  it('should get correct unapproved messages', async () => {
    const firstMessageData = [
      {
        name: 'Message',
        type: 'string',
        value: 'Hi, Alice!',
      },
      {
        name: 'A number',
        type: 'uint32',
        value: '1337',
      },
    ];
    const secondMessageData = [
      {
        name: 'Message',
        type: 'string',
        value: 'Hi, Alice!',
      },
      {
        name: 'A number',
        type: 'uint32',
        value: '1337',
      },
    ];
    const firstMessage = {
      id: '1',
      messageParams: { from: '0x1', data: firstMessageData },
      status: 'unapproved',
      time: 123,
      type: 'eth_signTypedData',
    };
    const secondMessage = {
      id: '2',
      messageParams: { from: '0x1', data: secondMessageData },
      status: 'unapproved',
      time: 123,
      type: 'eth_signTypedData',
    };
    const controller = new AbstractTestManager();
    await controller.addMessage(firstMessage);
    await controller.addMessage(secondMessage);
    expect(controller.getUnapprovedMessagesCount()).toBe(2);
    expect(controller.getUnapprovedMessages()).toStrictEqual({
      [firstMessage.id]: firstMessage,
      [secondMessage.id]: secondMessage,
    });
  });

  it('should approve typed message', async () => {
    const controller = new AbstractTestManager();
    const firstMessage = { from: '0xfoO', data: typedMessage };
    const version = 'V1';
    await controller.addMessage({
      id: messageId,
      messageParams: firstMessage,
      status: messageStatus,
      time: messageTime,
      type: messageType,
    });
    const messageParams = await controller.approveMessage({
      ...firstMessage,
      metamaskId: messageId,
      version,
    });
    const message = controller.getMessage(messageId);
    expect(messageParams).toStrictEqual(firstMessage);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.status).toBe('approved');
  });

  describe('addRequestToMessageParams', () => {
    it('adds original request id and origin to messageParams', () => {
      const controller = new AbstractTestManager();

      const result = controller.addRequestToMessageParams(
        mockMessageParams,
        mockRequest,
      );

      expect(result).toStrictEqual({
        ...mockMessageParams,
        origin: mockRequest.origin,
        requestId: mockRequest.id,
      });
    });
  });

  describe('createUnapprovedMessage', () => {
    it('creates a Message object with an unapproved status', () => {
      const controller = new AbstractTestManager();

      const result = controller.createUnapprovedMessage(
        mockMessageParams,
        ApprovalType.PersonalSign,
        mockRequest,
      );

      expect(result.messageParams).toBe(mockMessageParams);
      expect(result.securityAlertResponse).toBe(
        mockRequest.securityAlertResponse,
      );
      expect(result.status).toBe('unapproved');
      expect(result.type).toBe(ApprovalType.PersonalSign);
      expect(typeof result.time).toBe('number');
      expect(typeof result.id).toBe('string');
    });
  });

  describe('setMessageStatus', () => {
    it('updates the status of a message', async () => {
      jest.mock('events', () => ({
        emit: jest.fn(),
      }));

      const controller = new AbstractTestManager();
      await controller.addMessage({
        id: messageId,
        messageParams: { ...mockMessageParams },
        status: 'status',
        time: 10,
        type: 'type',
      });
      const messageBefore = controller.getMessage(messageId);
      expect(messageBefore?.status).toBe('status');

      controller.setMessageStatus(messageId, 'newstatus');

      const messageAfter = controller.getMessage(messageId);
      expect(messageAfter?.status).toBe('newstatus');
    });

    it('throws an error if the message is not found', async () => {
      const controller = new AbstractTestManager();

      expect(() => controller.setMessageStatus(messageId, 'newstatus')).toThrow(
        'AbstractMessageManager: Message not found for id: 1.',
      );
    });
  });

  describe('setMessageStatusAndResult', () => {
    it('emits updateBadge once', async () => {
      jest.mock('events', () => ({
        emit: jest.fn(),
      }));

      const controller = new AbstractTestManager();
      await controller.addMessage({
        id: messageId,
        messageParams: { ...mockMessageParams },
        status: 'status',
        time: 10,
        type: 'type',
      });
      const messageBefore = controller.getMessage(messageId);
      expect(messageBefore?.status).toBe('status');

      controller.setMessageStatusAndResult(messageId, 'newRawSig', 'newstatus');
      const messageAfter = controller.getMessage(messageId);

      // expect(controller.hub.emit).toHaveBeenNthCalledWith(1, 'updateBadge');
      expect(messageAfter?.status).toBe('newstatus');
    });
  });

  describe('setMetadata', () => {
    it('should set the given message metadata', async () => {
      const controller = new AbstractTestManager();
      await controller.addMessage({
        id: messageId,
        messageParams: { ...mockMessageParams },
        status: 'status',
        time: 10,
        type: 'type',
      });

      const messageBefore = controller.getMessage(messageId);
      expect(messageBefore?.metadata).toBeUndefined();

      controller.setMetadata(messageId, { foo: 'bar' });
      const messageAfter = controller.getMessage(messageId);
      expect(messageAfter?.metadata).toStrictEqual({ foo: 'bar' });
    });

    it('should throw an error if message is not found', () => {
      const controller = new AbstractTestManager();

      expect(() => controller.setMetadata(messageId, { foo: 'bar' })).toThrow(
        'AbstractMessageManager: Message not found for id: 1.',
      );
    });
  });

  describe('waitForFinishStatus', () => {
    it('signs the message when status is "signed"', async () => {
      const controller = new AbstractTestManager();
      const promise = controller.waitForFinishStatus(
        {
          from: fromMock,
          metamaskId: messageIdMock,
        },
        'AbstractTestManager',
      );

      setTimeout(() => {
        controller.hub.emit(`${messageIdMock}:finished`, {
          status: 'signed',
          rawSig: rawSigMock,
        });
      }, 100);

      expect(await promise).toStrictEqual(rawSigMock);
    });

    it('rejects with an error when status is "rejected"', async () => {
      const controller = new AbstractTestManager();
      const promise = controller.waitForFinishStatus(
        {
          from: fromMock,
          metamaskId: messageIdMock,
        },
        'AbstractTestManager',
      );

      setTimeout(() => {
        controller.hub.emit(`${messageIdMock}:finished`, {
          status: 'rejected',
        });
      }, 100);

      await expect(() => promise).rejects.toThrow(
        'MetaMask AbstractTestManager Signature: User denied message signature.',
      );
    });

    it('rejects with an error when finishes with unknown status', async () => {
      const controller = new AbstractTestManager();
      const promise = controller.waitForFinishStatus(
        {
          from: fromMock,
          metamaskId: messageIdMock,
        },
        'AbstractTestManager',
      );

      setTimeout(() => {
        controller.hub.emit(`${messageIdMock}:finished`, {
          status: 'unknown',
        });
      }, 100);

      await expect(() => promise).rejects.toThrow(
        `MetaMask AbstractTestManager Signature: Unknown problem: ${JSON.stringify(
          {
            from: fromMock,
          },
        )}`,
      );
    });

    it('rejects with an error when finishes with errored status', async () => {
      const controller = new AbstractTestManager();
      const promise = controller.waitForFinishStatus(
        {
          from: fromMock,
          metamaskId: messageIdMock,
        },
        'AbstractTestManager',
      );

      setTimeout(() => {
        controller.hub.emit(`${messageIdMock}:finished`, {
          status: 'errored',
          error: 'error message',
        });
      }, 100);

      await expect(() => promise).rejects.toThrow(
        `MetaMask AbstractTestManager Signature: error message`,
      );
    });
  });
});
