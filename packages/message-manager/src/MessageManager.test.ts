import { MessageManager } from './MessageManager';

describe('MessageManager', () => {
  let controller: MessageManager;

  const fromMock = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
  beforeEach(() => {
    controller = new MessageManager();
  });

  it('should set default state', () => {
    expect(controller.state).toStrictEqual({
      unapprovedMessages: {},
      unapprovedMessagesCount: 0,
    });
  });

  it('should set default config', () => {
    expect(controller.config).toStrictEqual({});
  });

  it('should add a valid message', async () => {
    const messageId = '1';
    const from = '0x0123';
    const messageData = '0x123';
    const messageTime = Date.now();
    const messageStatus = 'unapproved';
    const messageType = 'eth_sign';
    await controller.addMessage({
      id: messageId,
      messageParams: {
        data: messageData,
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

  it('should add a valid unapproved message', async () => {
    const messageStatus = 'unapproved';
    const messageType = 'eth_sign';
    const messageParams = {
      data: '0x123',
      from: fromMock,
    };
    const originalRequest = {
      origin: 'origin',
      securityAlertResponse: { result_type: 'result_type', reason: 'reason' },
    };
    const messageId = await controller.addUnapprovedMessage(
      messageParams,
      originalRequest,
    );
    expect(messageId).toBeDefined();
    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.messageParams.from).toBe(messageParams.from);
    expect(message.messageParams.data).toBe(messageParams.data);
    expect(message.time).toBeDefined();
    expect(message.status).toBe(messageStatus);
    expect(message.type).toBe(messageType);
    expect(message.securityAlertResponse?.result_type).toBe('result_type');
    expect(message.securityAlertResponse?.reason).toBe('reason');
  });

  it('should throw when adding invalid message', async () => {
    const from = 'foo';
    const messageData = '0x123';
    await expect(
      controller.addUnapprovedMessage({
        data: messageData,
        from,
      }),
    ).rejects.toThrow(
      `Invalid "from" address: ${from} must be a valid string.`,
    );
  });

  it('should get correct unapproved messages', async () => {
    const firstMessage = {
      id: '1',
      messageParams: { from: '0x1', data: '0x123' },
      status: 'unapproved',
      time: 123,
      type: 'eth_sign',
    };
    const secondMessage = {
      id: '2',
      messageParams: { from: '0x1', data: '0x321' },
      status: 'unapproved',
      time: 123,
      type: 'eth_sign',
    };
    await controller.addMessage(firstMessage);
    await controller.addMessage(secondMessage);
    expect(controller.getUnapprovedMessagesCount()).toBe(2);
    expect(controller.getUnapprovedMessages()).toStrictEqual({
      [firstMessage.id]: firstMessage,
      [secondMessage.id]: secondMessage,
    });
  });

  it('should approve message', async () => {
    const firstMessage = { from: fromMock, data: '0x123' };
    const messageId = await controller.addUnapprovedMessage(firstMessage);
    const messageParams = await controller.approveMessage({
      ...firstMessage,
      metamaskId: messageId,
    });
    const message = controller.getMessage(messageId);
    expect(messageParams).toStrictEqual(firstMessage);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.status).toBe('approved');
  });

  it('should set message status signed', async () => {
    const firstMessage = { from: fromMock, data: '0x123' };
    const rawSig = '0x5f7a0';
    const messageId = await controller.addUnapprovedMessage(firstMessage);

    controller.setMessageStatusSigned(messageId, rawSig);
    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.rawSig).toStrictEqual(rawSig);
    expect(message.status).toBe('signed');
  });

  it('should reject message', async () => {
    const firstMessage = { from: fromMock, data: '0x123' };
    const messageId = await controller.addUnapprovedMessage(firstMessage);
    controller.rejectMessage(messageId);
    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.status).toBe('rejected');
  });
});
