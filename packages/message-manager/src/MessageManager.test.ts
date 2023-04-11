import { MessageManager } from './MessageManager';

describe('MessageManager', () => {
  let controller: MessageManager;

  const fromMock = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
  const dataMock = '0x879a053d4800c6354e76c7985a865d2922c82fb5b';
  const messageIdMock = 'message-id-mocked';
  const rawSigMock = '0xsignaturemocked';
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

  describe('addUnapprovedMessageAsync', () => {
    beforeEach(() => {
      jest
        .spyOn(controller, 'addUnapprovedMessage')
        .mockImplementation()
        .mockResolvedValue(messageIdMock);
    });

    afterAll(() => {
      jest.spyOn(controller, 'addUnapprovedMessage').mockClear();
    });
    it('signs the message when status is "signed"', async () => {
      const promise = controller.addUnapprovedMessageAsync({
        data: dataMock,
        from: fromMock,
      });

      setTimeout(() => {
        controller.hub.emit(`${messageIdMock}:finished`, {
          status: 'signed',
          rawSig: rawSigMock,
        });
      }, 100);

      expect(await promise).toStrictEqual(rawSigMock);
    });

    it('rejects with an error when status is "rejected"', async () => {
      const promise = controller.addUnapprovedMessageAsync({
        data: dataMock,
        from: fromMock,
      });

      setTimeout(() => {
        controller.hub.emit(`${messageIdMock}:finished`, {
          status: 'rejected',
        });
      }, 100);

      await expect(() => promise).rejects.toThrow(
        'MetaMask Message Signature: User denied message signature.',
      );
    });

    it('rejects with an error when unapproved finishes', async () => {
      const promise = controller.addUnapprovedMessageAsync({
        data: dataMock,
        from: fromMock,
      });

      setTimeout(() => {
        controller.hub.emit(`${messageIdMock}:finished`, {
          status: 'unknown',
        });
      }, 100);

      await expect(() => promise).rejects.toThrow(
        `MetaMask Message Signature: Unknown problem: ${JSON.stringify({
          data: dataMock,
          from: fromMock,
        })}`,
      );
    });
  });

  it('should add a valid unapproved message', async () => {
    const messageStatus = 'unapproved';
    const messageType = 'eth_sign';
    const messageParams = {
      data: '0x123',
      from: '0xfoO',
    };
    const originalRequest = { origin: 'origin' };
    const messageId = await controller.addUnapprovedMessage(
      messageParams,
      originalRequest,
    );
    expect(messageId).not.toBeUndefined();
    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.messageParams.from).toBe(messageParams.from);
    expect(message.messageParams.data).toBe(messageParams.data);
    expect(message.time).not.toBeUndefined();
    expect(message.status).toBe(messageStatus);
    expect(message.type).toBe(messageType);
  });

  it('should throw when adding invalid message', async () => {
    const from = 'foo';
    const messageData = '0x123';
    await expect(
      controller.addUnapprovedMessageAsync({
        data: messageData,
        from,
      }),
    ).rejects.toThrow(`Invalid address: ${from} must be a valid string.`);
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
    expect(controller.getUnapprovedMessagesCount()).toStrictEqual(2);
    expect(controller.getUnapprovedMessages()).toStrictEqual({
      [firstMessage.id]: firstMessage,
      [secondMessage.id]: secondMessage,
    });
  });

  it('should approve message', async () => {
    const firstMessage = { from: 'foo', data: '0x123' };
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
    expect(message.status).toStrictEqual('approved');
  });

  it('should set message status signed', async () => {
    const firstMessage = { from: 'foo', data: '0x123' };
    const rawSig = '0x5f7a0';
    const messageId = await controller.addUnapprovedMessage(firstMessage);

    controller.setMessageStatusSigned(messageId, rawSig);
    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.rawSig).toStrictEqual(rawSig);
    expect(message.status).toStrictEqual('signed');
  });

  it('should reject message', async () => {
    const firstMessage = { from: 'foo', data: '0x123' };
    const messageId = await controller.addUnapprovedMessage(firstMessage);
    controller.rejectMessage(messageId);
    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.status).toStrictEqual('rejected');
  });
});
