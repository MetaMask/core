import { TypedMessage, TypedMessageParams, TypedMessageParamsMetamask } from './TypedMessageManager';
import AbstractMessageManager from './AbstractMessageManager';

class AbstractTestManager extends AbstractMessageManager<TypedMessage, TypedMessageParams, TypedMessageParamsMetamask> {
  prepMessageForSigning(messageParams: TypedMessageParamsMetamask): Promise<TypedMessageParams> {
    delete messageParams.metamaskId;
    delete messageParams.version;
    return Promise.resolve(messageParams);
  }

  setMessageStatus(messageId: string, status: string) {
    return super.setMessageStatus(messageId, status);
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
const from = '0x0123';
const messageTime = Date.now();
const messageStatus = 'unapproved';
const messageType = 'eth_signTypedData';
const messageData = typedMessage;

describe('AbstractTestManager', () => {
  it('should set default state', () => {
    const controller = new AbstractTestManager();
    expect(controller.state).toEqual({ unapprovedMessages: {}, unapprovedMessagesCount: 0 });
  });

  it('should set default config', () => {
    const controller = new AbstractTestManager();
    expect(controller.config).toEqual({});
  });

  it('should add a valid message', async () => {
    const controller = new AbstractTestManager();
    controller.addMessage({
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
    expect(message).not.toBeUndefined();
    if (message) {
      expect(message.id).toBe(messageId);
      expect(message.messageParams.from).toBe(from);
      expect(message.messageParams.data).toBe(messageData);
      expect(message.time).toBe(messageTime);
      expect(message.status).toBe(messageStatus);
      expect(message.type).toBe(messageType);
    }
  });

  it('should reject a message', () => {
    const controller = new AbstractTestManager();
    controller.addMessage({
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
    expect(message).not.toBeUndefined();
    if (message) {
      expect(message.status).toBe('rejected');
    }
  });

  it('should sign a message', () => {
    const controller = new AbstractTestManager();
    controller.addMessage({
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
    expect(message).not.toBeUndefined();
    if (message) {
      expect(message.status).toBe('signed');
      expect(message.rawSig).toBe('rawSig');
    }
  });

  it('should get correct unapproved messages', () => {
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
    controller.addMessage(firstMessage);
    controller.addMessage(secondMessage);
    expect(controller.getUnapprovedMessagesCount()).toEqual(2);
    expect(controller.getUnapprovedMessages()).toEqual({
      [firstMessage.id]: firstMessage,
      [secondMessage.id]: secondMessage,
    });
  });

  it('should approve typed message', async () => {
    const controller = new AbstractTestManager();
    const firstMessage = { from: '0xfoO', data: typedMessage };
    const version = 'V1';
    controller.addMessage({
      id: messageId,
      messageParams: firstMessage,
      status: messageStatus,
      time: messageTime,
      type: messageType,
    });
    const messageParams = await controller.approveMessage({ ...firstMessage, metamaskId: messageId, version });
    const message = controller.getMessage(messageId);
    expect(messageParams).toEqual(firstMessage);
    expect(message).not.toBeUndefined();
    if (message) {
      expect(message.status).toEqual('approved');
    }
  });

  describe('setMessageStatus', () => {
    it('should set the given message status', () => {
      const controller = new AbstractTestManager();
      controller.addMessage({
        id: messageId,
        messageParams: { from: '0x1234', data: 'test' },
        status: 'status',
        time: 10,
        type: 'type',
      });
      const messageBefore = controller.getMessage(messageId);
      expect(messageBefore?.status).toEqual('status');

      controller.setMessageStatus(messageId, 'newstatus');
      const messageAfter = controller.getMessage(messageId);
      expect(messageAfter?.status).toEqual('newstatus');
    });

    it('should throw an error if message is not found', () => {
      const controller = new AbstractTestManager();

      expect(() => controller.setMessageStatus(messageId, 'newstatus')).toThrow(
        'AbstractMessageManager: Message not found for id: 1.',
      );
    });
  });
});
