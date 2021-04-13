import PersonalMessageManager from './PersonalMessageManager';

describe('PersonalMessageManager', () => {
  it('should set default state', () => {
    const controller = new PersonalMessageManager();
    expect(controller.state).toStrictEqual({ unapprovedMessages: {}, unapprovedMessagesCount: 0 });
  });

  it('should set default config', () => {
    const controller = new PersonalMessageManager();
    expect(controller.config).toStrictEqual({});
  });

  it('should add a valid message', async () => {
    const controller = new PersonalMessageManager();
    const messageId = '1';
    const from = '0x0123';
    const messageData = '0x123';
    const messageTime = Date.now();
    const messageStatus = 'unapproved';
    const messageType = 'personal_sign';
    controller.addMessage({
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

  it('should reject a message', async () => {
    const controller = new PersonalMessageManager();
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const data = '0x879a053d4800c6354e76c7985a865d2922c82fb5b';
    const result = controller.addUnapprovedMessageAsync({
      data,
      from,
    });
    const unapprovedMessages = controller.getUnapprovedMessages();
    const keys = Object.keys(unapprovedMessages);
    controller.hub.once(`${keys[0]}:finished`, () => {
      expect(unapprovedMessages[keys[0]].messageParams.from).toBe(from);
      expect(unapprovedMessages[keys[0]].status).toBe('rejected');
    });
    controller.rejectMessage(keys[0]);
    await expect(result).rejects.toThrow('User denied message signature');
  });

  it('should sign a message', async () => {
    const controller = new PersonalMessageManager();
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const data = '0x879a053d4800c6354e76c7985a865d2922c82fb5b';
    const rawSig = '0x5f7a0';
    const result = controller.addUnapprovedMessageAsync({
      data,
      from,
    });
    const unapprovedMessages = controller.getUnapprovedMessages();
    const keys = Object.keys(unapprovedMessages);
    controller.hub.once(`${keys[0]}:finished`, () => {
      expect(unapprovedMessages[keys[0]].messageParams.from).toBe(from);
      expect(unapprovedMessages[keys[0]].status).toBe('signed');
    });
    controller.setMessageStatusSigned(keys[0], rawSig);
    const sig = await result;
    expect(sig).toBe(rawSig);
  });

  it('should throw when unapproved finishes', async () => {
    const controller = new PersonalMessageManager();
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const data = '0x879a053d4800c6354e76c7985a865d2922c82fb5b';
    const result = controller.addUnapprovedMessageAsync({
      data,
      from,
    });
    const unapprovedMessages = controller.getUnapprovedMessages();
    const keys = Object.keys(unapprovedMessages);
    controller.hub.emit(`${keys[0]}:finished`, unapprovedMessages[keys[0]]);
    await expect(result).rejects.toThrow('Unknown problem');
  });

  it('should add a valid unapproved message', async () => {
    const controller = new PersonalMessageManager();
    const messageStatus = 'unapproved';
    const messageType = 'personal_sign';
    const messageParams = {
      data: '0x123',
      from: '0xfoO',
    };
    const originalRequest = { origin: 'origin' };
    const messageId = controller.addUnapprovedMessage(messageParams, originalRequest);
    expect(messageId).not.toBeUndefined();
    const message = controller.getMessage(messageId);
    if (message) {
      expect(message.messageParams.from).toBe(messageParams.from);
      expect(message.messageParams.data).toBe(messageParams.data);
      expect(message.time).not.toBeUndefined();
      expect(message.status).toBe(messageStatus);
      expect(message.type).toBe(messageType);
    }
  });

  it('should throw when adding invalid message', async () => {
    const from = 'foo';
    const messageData = '0x123';
    const controller = new PersonalMessageManager();
    await expect(
      controller.addUnapprovedMessageAsync({
        data: messageData,
        from,
      }),
    ).rejects.toThrow('Invalid "from" address:');
  });

  it('should get correct unapproved messages', () => {
    const firstMessage = {
      id: '1',
      messageParams: { from: '0x1', data: '0x123' },
      status: 'unapproved',
      time: 123,
      type: 'personal_sign',
    };
    const secondMessage = {
      id: '2',
      messageParams: { from: '0x1', data: '0x321' },
      status: 'unapproved',
      time: 123,
      type: 'personal_sign',
    };
    const controller = new PersonalMessageManager();
    controller.addMessage(firstMessage);
    controller.addMessage(secondMessage);
    expect(controller.getUnapprovedMessagesCount()).toStrictEqual(2);
    expect(controller.getUnapprovedMessages()).toStrictEqual({
      [firstMessage.id]: firstMessage,
      [secondMessage.id]: secondMessage,
    });
  });

  it('should approve message', async () => {
    const controller = new PersonalMessageManager();
    const firstMessage = { from: 'foo', data: '0x123' };
    const messageId = controller.addUnapprovedMessage(firstMessage);
    const messageParams = await controller.approveMessage({ ...firstMessage, metamaskId: messageId });
    const message = controller.getMessage(messageId);
    expect(messageParams).toStrictEqual(firstMessage);
    expect(message).not.toBeUndefined();
    if (message) {
      expect(message.status).toStrictEqual('approved');
    }
  });

  it('should set message status signed', () => {
    const controller = new PersonalMessageManager();
    const firstMessage = { from: 'foo', data: '0x123' };
    const rawSig = '0x5f7a0';
    const messageId = controller.addUnapprovedMessage(firstMessage);

    controller.setMessageStatusSigned(messageId, rawSig);
    const message = controller.getMessage(messageId);
    expect(message).not.toBeUndefined();
    if (message) {
      expect(message.rawSig).toStrictEqual(rawSig);
      expect(message.status).toStrictEqual('signed');
    }
  });

  it('should reject message', () => {
    const controller = new PersonalMessageManager();
    const firstMessage = { from: 'foo', data: '0x123' };
    const messageId = controller.addUnapprovedMessage(firstMessage);
    controller.rejectMessage(messageId);
    const message = controller.getMessage(messageId);
    expect(message).not.toBeUndefined();
    if (message) {
      expect(message.status).toStrictEqual('rejected');
    }
  });
});
