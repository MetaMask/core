import { EncryptionPublicKeyManager } from './EncryptionPublicKeyManager';

describe('EncryptionPublicKeyManager', () => {
  let controller: EncryptionPublicKeyManager;

  const fromMock = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
  const messageIdMock = 'message-id-mocked';
  const rawSigMock = '231124fe67213512=';

  beforeEach(() => {
    controller = new EncryptionPublicKeyManager();
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
    const messageTime = Date.now();
    const messageStatus = 'unapproved';
    const messageType = 'eth_getEncryptionPublicKey';
    await controller.addMessage({
      id: messageIdMock,
      messageParams: {
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
    expect(message.time).toBe(messageTime);
    expect(message.status).toBe(messageStatus);
    expect(message.type).toBe(messageType);
  });

  describe('addUnapprovedMessageAsync', () => {
    beforeEach(() => {
      controller = new EncryptionPublicKeyManager(
        undefined,
        undefined,
        undefined,
        ['received'],
      );

      jest
        .spyOn(controller, 'addUnapprovedMessage')
        .mockImplementation()
        .mockResolvedValue(messageIdMock);
    });

    afterAll(() => {
      jest.spyOn(controller, 'addUnapprovedMessage').mockClear();
    });
    it('sets message to "received"', async () => {
      const promise = controller.addUnapprovedMessageAsync({
        from: fromMock,
      });

      setTimeout(() => {
        controller.hub.emit(`${messageIdMock}:finished`, {
          status: 'received',
          rawSig: rawSigMock,
        });
      }, 100);

      expect(await promise).toStrictEqual(rawSigMock);
    });

    it('rejects with an error when status is "rejected"', async () => {
      const promise = controller.addUnapprovedMessageAsync({
        from: fromMock,
      });

      setTimeout(() => {
        controller.hub.emit(`${messageIdMock}:finished`, {
          status: 'rejected',
        });
      }, 100);

      await expect(() => promise).rejects.toThrow(
        'MetaMask EncryptionPublicKey: User denied message EncryptionPublicKey.',
      );
    });

    it('rejects with an error when unapproved finishes', async () => {
      const promise = controller.addUnapprovedMessageAsync({
        from: fromMock,
      });

      setTimeout(() => {
        controller.hub.emit(`${messageIdMock}:finished`, {
          status: 'unknown',
        });
      }, 100);

      await expect(() => promise).rejects.toThrow(
        `MetaMask EncryptionPublicKey: Unknown problem: ${JSON.stringify({
          from: fromMock,
        })}`,
      );
    });
  });

  it('adds a valid unapproved message', async () => {
    const messageStatus = 'unapproved';
    const messageType = 'eth_getEncryptionPublicKey';
    const messageParams = {
      from: fromMock,
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
    expect(message.time).not.toBeUndefined();
    expect(message.status).toBe(messageStatus);
    expect(message.type).toBe(messageType);
  });

  it('throws when adding invalid message', async () => {
    const from = 'foo';
    await expect(
      controller.addUnapprovedMessageAsync({
        from,
      }),
    ).rejects.toThrow('Invalid "from" address:');
  });

  it('gets correct unapproved messages', async () => {
    const firstMessage = {
      id: '1',
      messageParams: { from: fromMock },
      status: 'unapproved',
      time: 123,
      type: 'eth_getEncryptionPublicKey',
    };
    const secondMessage = {
      id: '2',
      messageParams: { from: '0x3244e191f1b4903970224322180f1fbbc415696b' },
      status: 'unapproved',
      time: 123,
      type: 'eth_getEncryptionPublicKey',
    };
    await controller.addMessage(firstMessage);
    await controller.addMessage(secondMessage);
    expect(controller.getUnapprovedMessagesCount()).toStrictEqual(2);
    expect(controller.getUnapprovedMessages()).toStrictEqual({
      [firstMessage.id]: firstMessage,
      [secondMessage.id]: secondMessage,
    });
  });

  it('approves message', async () => {
    const firstMessage = { from: fromMock };
    const messageId = await controller.addUnapprovedMessage(firstMessage);
    const messageParams = await controller.approveMessage({
      from: fromMock,
      data: fromMock,
      metamaskId: messageId,
    });
    const message = controller.getMessage(messageId);
    expect(messageParams).toStrictEqual(firstMessage);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.status).toStrictEqual('approved');
  });

  it('sets message status received', async () => {
    const firstMessage = { from: fromMock };
    const messageId = await controller.addUnapprovedMessage(firstMessage);

    controller.setMessageStatusAndResult(messageId, rawSigMock, 'received');
    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.rawSig).toStrictEqual(rawSigMock);
    expect(message.status).toStrictEqual('received');
  });

  it('rejects message', async () => {
    const firstMessage = { from: fromMock };
    const messageId = await controller.addUnapprovedMessage(firstMessage);
    controller.rejectMessage(messageId);
    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.status).toStrictEqual('rejected');
  });
});
