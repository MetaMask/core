import { EncryptionPublicKeyManager } from './EncryptionPublicKeyManager';

describe('EncryptionPublicKeyManager', () => {
  it('sets default state', () => {
    const controller = new EncryptionPublicKeyManager();
    expect(controller.state).toStrictEqual({
      unapprovedMessages: {},
      unapprovedMessagesCount: 0,
    });
  });

  it('sets default config', () => {
    const controller = new EncryptionPublicKeyManager();
    expect(controller.config).toStrictEqual({});
  });

  it('adds a valid message', async () => {
    const controller = new EncryptionPublicKeyManager();
    const messageId = '1';
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const messageTime = Date.now();
    const messageStatus = 'unapproved';
    const messageType = 'eth_getEncryptionPublicKey';
    controller.addMessage({
      id: messageId,
      messageParams: {
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
    expect(message.time).toBe(messageTime);
    expect(message.status).toBe(messageStatus);
    expect(message.type).toBe(messageType);
  });

  it('rejects a message', async () => {
    const controller = new EncryptionPublicKeyManager();
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const result = controller.addUnapprovedMessageAsync({
      from,
    });
    const unapprovedMessages = controller.getUnapprovedMessages();
    const keys = Object.keys(unapprovedMessages);
    controller.hub.once(`${keys[0]}:finished`, () => {
      expect(unapprovedMessages[keys[0]].messageParams.from).toBe(from);
      expect(unapprovedMessages[keys[0]].status).toBe('rejected');
    });
    controller.rejectMessage(keys[0]);
    await expect(result).rejects.toThrow(
      'MetaMask EncryptionPublicKey: User denied message EncryptionPublicKey',
    );
  });

  it('sets message to received', async () => {
    const controller = new EncryptionPublicKeyManager(undefined, undefined, [
      'received',
    ]);
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const rawSig = '231124fe67213512=';
    const result = controller.addUnapprovedMessageAsync({
      from,
    });
    const unapprovedMessages = controller.getUnapprovedMessages();
    const keys = Object.keys(unapprovedMessages);
    controller.hub.once(`${keys[0]}:finished`, () => {
      expect(unapprovedMessages[keys[0]].messageParams.from).toBe(from);
      expect(unapprovedMessages[keys[0]].status).toBe('received');
    });
    controller.setMessageStatusAndResult(keys[0], rawSig, 'received');
    const publicKey = await result;
    expect(publicKey).toBe(rawSig);
  });

  it('throws when unapproved finishes', async () => {
    const controller = new EncryptionPublicKeyManager();
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const result = controller.addUnapprovedMessageAsync({
      from,
    });
    const unapprovedMessages = controller.getUnapprovedMessages();
    const keys = Object.keys(unapprovedMessages);
    controller.hub.emit(`${keys[0]}:finished`, unapprovedMessages[keys[0]]);
    await expect(result).rejects.toThrow('Unknown problem');
  });

  it('adds a valid unapproved message', async () => {
    const controller = new EncryptionPublicKeyManager();
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const messageStatus = 'unapproved';
    const messageType = 'eth_getEncryptionPublicKey';
    const messageParams = {
      from,
    };
    const originalRequest = { origin: 'origin' };
    const messageId = controller.addUnapprovedMessage(
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
    const controller = new EncryptionPublicKeyManager();
    await expect(
      controller.addUnapprovedMessageAsync({
        from,
      }),
    ).rejects.toThrow('Invalid "from" address:');
  });

  it('gets correct unapproved messages', () => {
    const firstMessage = {
      id: '1',
      messageParams: { from: '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d' },
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
    const controller = new EncryptionPublicKeyManager();
    controller.addMessage(firstMessage);
    controller.addMessage(secondMessage);
    expect(controller.getUnapprovedMessagesCount()).toStrictEqual(2);
    expect(controller.getUnapprovedMessages()).toStrictEqual({
      [firstMessage.id]: firstMessage,
      [secondMessage.id]: secondMessage,
    });
  });

  it('approves message', async () => {
    const controller = new EncryptionPublicKeyManager();
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const firstMessage = { from };
    const messageId = controller.addUnapprovedMessage(firstMessage);
    const messageParams = await controller.approveMessage({
      from,
      data: from,
      metamaskId: messageId,
    });
    const message = controller.getMessage(messageId);
    expect(messageParams).toStrictEqual(firstMessage);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.status).toStrictEqual('approved');
  });

  it('sets message status received', () => {
    const controller = new EncryptionPublicKeyManager();
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const firstMessage = { from };
    const rawSig = '231124fe67213512=';
    const messageId = controller.addUnapprovedMessage(firstMessage);

    controller.setMessageStatusAndResult(messageId, rawSig, 'received');
    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.rawSig).toStrictEqual(rawSig);
    expect(message.status).toStrictEqual('received');
  });

  it('rejects message', () => {
    const controller = new EncryptionPublicKeyManager();
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const firstMessage = { from };
    const messageId = controller.addUnapprovedMessage(firstMessage);
    controller.rejectMessage(messageId);
    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.status).toStrictEqual('rejected');
  });
});
