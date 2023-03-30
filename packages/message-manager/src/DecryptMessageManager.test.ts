import { DecryptMessageManager } from './DecryptMessageManager';

describe('DecryptMessageManager', () => {
  it('sets default state', () => {
    const controller = new DecryptMessageManager();
    expect(controller.state).toStrictEqual({
      unapprovedMessages: {},
      unapprovedMessagesCount: 0,
    });
  });

  it('sets default config', () => {
    const controller = new DecryptMessageManager();
    expect(controller.config).toStrictEqual({});
  });

  it('adds a valid message', async () => {
    const controller = new DecryptMessageManager();
    const messageId = '1';
    const from = '0x0123';
    const messageData = '0x123';
    const messageTime = Date.now();
    const messageStatus = 'unapproved';
    const messageType = 'eth_decrypt';
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

  it('approves message', async () => {
    const controller = new DecryptMessageManager();
    const from = '0x0123';
    const data = '0x0123';
    const messageParams = { from, data };
    const messageId = controller.addUnapprovedMessage(messageParams);
    const approvedMessageParams = await controller.approveMessage({
      from,
      data: from,
      metamaskId: messageId,
    });
    const message = controller.getMessage(messageId);
    expect(messageParams).toStrictEqual(approvedMessageParams);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.status).toStrictEqual('approved');
  });

  it('throws error if message dont have from', async () => {
    const controller = new DecryptMessageManager();
    const result = controller.addUnapprovedMessageAsync({
      data: '0x123',
    } as any);
    await expect(result).rejects.toThrow(
      'MetaMask Decryption: from field is required.',
    );
  });

  it('sets message to decrypted', async () => {
    const controller = new DecryptMessageManager();
    const from = '0x0123';
    const rawSig = '0x123';
    const data = '0x12345';
    const result = controller.addUnapprovedMessageAsync({
      from,
      data,
    });
    const unapprovedMessages = controller.getUnapprovedMessages();
    const keys = Object.keys(unapprovedMessages);
    controller.hub.once(`${keys[0]}:finished`, () => {
      expect(unapprovedMessages[keys[0]].messageParams.from).toBe(from);
      expect(unapprovedMessages[keys[0]].status).toBe('decrypted');
    });
    controller.setMessageStatusAndResult(keys[0], rawSig, 'decrypted');
    expect(await result).toStrictEqual(rawSig);
  });

  it('rejects a message', async () => {
    const controller = new DecryptMessageManager();
    const from = '0x0123';
    const result = controller.addUnapprovedMessageAsync({
      from,
      data: '0x123',
    });
    const unapprovedMessages = controller.getUnapprovedMessages();
    const keys = Object.keys(unapprovedMessages);
    controller.hub.once(`${keys[0]}:finished`, () => {
      expect(unapprovedMessages[keys[0]].messageParams.from).toBe(from);
      expect(unapprovedMessages[keys[0]].status).toBe('rejected');
    });

    controller.rejectMessage(keys[0]);
    await expect(result).rejects.toThrow(
      'MetaMask Decryption: User denied message decryption.',
    );
  });

  it('throws error if message is not decrypted and errored', async () => {
    const controller = new DecryptMessageManager();
    const from = '0x0123';
    const rawSig = '0x123';
    const result = controller.addUnapprovedMessageAsync({
      from,
      data: '0x123',
    });
    const unapprovedMessages = controller.getUnapprovedMessages();
    const keys = Object.keys(unapprovedMessages);
    controller.hub.once(`${keys[0]}:finished`, () => {
      expect(unapprovedMessages[keys[0]].messageParams.from).toBe(from);
      expect(unapprovedMessages[keys[0]].status).toBe('errored');
    });

    controller.setMessageStatusAndResult(keys[0], rawSig, 'errored');
    await expect(result).rejects.toThrow(
      'MetaMask Decryption: This message cannot be decrypted.',
    );
  });

  it('throws error if status is unknown', async () => {
    const controller = new DecryptMessageManager();
    const from = '0x0123';
    const rawSig = '0x123';
    const result = controller.addUnapprovedMessageAsync({
      from,
      data: '0x123',
    });
    const unapprovedMessages = controller.getUnapprovedMessages();
    const keys = Object.keys(unapprovedMessages);
    controller.hub.once(`${keys[0]}:finished`, () => {
      expect(unapprovedMessages[keys[0]].messageParams.from).toBe(from);
      expect(unapprovedMessages[keys[0]].status).toBe('signed');
    });

    controller.setMessageStatusAndResult(keys[0], rawSig, 'signed');
    await expect(result).rejects.toThrow(
      'MetaMask Decryption: Unknown problem: {"from":"0x0123","data":"0x123"',
    );
  });

  it('adds valid unapproved message', async () => {
    const controller = new DecryptMessageManager();
    const from = '0x0123';
    const data = '0x12345';
    const originalRequest = { origin: 'origin' };
    const messageParams = {
      from,
      data,
    };
    const messageId = controller.addUnapprovedMessage(
      messageParams,
      originalRequest,
    );
    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.messageParams.from).toBe(messageParams.from);
    expect(message.messageParams.data).toBe(messageParams.data);
    expect(message.status).toBe('unapproved');
  });
});
