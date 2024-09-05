import { DecryptMessageManager } from './DecryptMessageManager';

describe('DecryptMessageManager', () => {
  let controller: DecryptMessageManager;

  const messageIdMock = 'message-id-mocked';
  const fromMock = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
  const rawSigMock = '231124fe67213512=';
  const dataMock = '0x12345';

  beforeEach(() => {
    controller = new DecryptMessageManager();
  });

  it('sets default state', () => {
    expect(controller.state).toStrictEqual({
      unapprovedMessages: {},
      unapprovedMessagesCount: 0,
    });
  });

  it('sets default config', () => {
    expect(controller.config).toStrictEqual({});
  });

  it('adds a valid message', async () => {
    const messageData = '0x123';
    const messageTime = Date.now();
    const messageStatus = 'unapproved';
    const messageType = 'eth_decrypt';
    await controller.addMessage({
      id: messageIdMock,
      messageParams: {
        data: messageData,
        from: fromMock,
      },
      status: messageStatus,
      time: messageTime,
      type: messageType,
    });
    const message = controller.getMessage(messageIdMock);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.id).toBe(messageIdMock);
    expect(message.messageParams.from).toBe(fromMock);
    expect(message.messageParams.data).toBe(messageData);
    expect(message.time).toBe(messageTime);
    expect(message.status).toBe(messageStatus);
    expect(message.type).toBe(messageType);
  });

  describe('addUnapprovedMessageAsync', () => {
    beforeEach(() => {
      controller = new DecryptMessageManager(undefined, undefined, undefined, [
        'decrypted',
      ]);

      jest
        .spyOn(controller, 'addUnapprovedMessage')
        .mockImplementation()
        .mockResolvedValue(messageIdMock);
    });

    afterAll(() => {
      jest.spyOn(controller, 'addUnapprovedMessage').mockClear();
    });

    it('sets message to decrypted', async () => {
      const promise = controller.addUnapprovedMessageAsync({
        from: fromMock,
        data: dataMock,
      });
      setTimeout(() => {
        controller.hub.emit(`${messageIdMock}:finished`, {
          status: 'decrypted',
          rawSig: rawSigMock,
        });
      }, 100);

      expect(await promise).toStrictEqual(rawSigMock);
    });

    it('rejects with an error when status is "rejected"', async () => {
      const promise = controller.addUnapprovedMessageAsync({
        from: fromMock,
        data: dataMock,
      });

      setTimeout(() => {
        controller.hub.emit(`${messageIdMock}:finished`, {
          status: 'rejected',
        });
      }, 100);

      await expect(() => promise).rejects.toThrow(
        'MetaMask DecryptMessage: User denied message decryption.',
      );
    });

    it('rejects with an error when decryption errored', async () => {
      const promise = controller.addUnapprovedMessageAsync({
        from: fromMock,
        data: dataMock,
      });

      setTimeout(() => {
        controller.hub.emit(`${messageIdMock}:finished`, {
          status: 'errored',
        });
      }, 100);

      await expect(() => promise).rejects.toThrow(
        `MetaMask DecryptMessage: This message cannot be decrypted.`,
      );
    });

    it('rejects with an error when unapproved finishes', async () => {
      const promise = controller.addUnapprovedMessageAsync({
        from: fromMock,
        data: dataMock,
      });

      setTimeout(() => {
        controller.hub.emit(`${messageIdMock}:finished`, {
          status: 'unknown',
        });
      }, 100);

      await expect(() => promise).rejects.toThrow(
        `MetaMask DecryptMessage: Unknown problem: ${JSON.stringify({
          from: fromMock,
          data: dataMock,
        })}`,
      );
    });
  });

  it('adds a valid unapproved message', async () => {
    const messageStatus = 'unapproved';
    const messageType = 'eth_decrypt';
    const messageParams = { from: fromMock, data: dataMock };
    const originalRequest = { id: 111, origin: 'origin' };
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
    expect(message.messageParams.requestId).toBe(originalRequest.id);
    expect(message.time).toBeDefined();
    expect(message.status).toBe(messageStatus);
    expect(message.type).toBe(messageType);
  });

  it('throws when adding invalid message', async () => {
    const from = 'foo';
    await expect(
      controller.addUnapprovedMessageAsync({
        from,
        data: dataMock,
      }),
    ).rejects.toThrow(
      `Invalid "from" address: ${from} must be a valid string.`,
    );
  });

  it('gets correct unapproved messages', async () => {
    const firstMessage = {
      id: '1',
      messageParams: { from: fromMock, data: dataMock },
      status: 'unapproved',
      time: 123,
      type: 'eth_decrypt',
    };
    const secondMessage = {
      id: '2',
      messageParams: {
        from: '0x3244e191f1b4903970224322180f1fbbc415696b',
        data: dataMock,
      },
      status: 'unapproved',
      time: 123,
      type: 'eth_decrypt',
    };
    await controller.addMessage(firstMessage);
    await controller.addMessage(secondMessage);
    expect(controller.getUnapprovedMessagesCount()).toBe(2);
    expect(controller.getUnapprovedMessages()).toStrictEqual({
      [firstMessage.id]: firstMessage,
      [secondMessage.id]: secondMessage,
    });
  });

  it('approves message', async () => {
    const firstMessage = { from: fromMock, data: dataMock };
    const messageId = await controller.addUnapprovedMessage(firstMessage);
    const messageParams = await controller.approveMessage({
      from: fromMock,
      data: dataMock,
      metamaskId: messageId,
    });
    const message = controller.getMessage(messageId);
    expect(messageParams).toStrictEqual(firstMessage);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.status).toBe('approved');
  });
});
