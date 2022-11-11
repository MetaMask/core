import { TypedMessageManager } from './TypedMessageManager';

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
describe('TypedMessageManager', () => {
  it('should set default state', () => {
    const controller = new TypedMessageManager();
    expect(controller.state).toStrictEqual({
      unapprovedMessages: {},
      unapprovedMessagesCount: 0,
    });
  });

  it('should set default config', () => {
    const controller = new TypedMessageManager();
    expect(controller.config).toStrictEqual({});
  });

  it('should add a valid message', async () => {
    const controller = new TypedMessageManager();
    const messageId = '1';
    const from = '0x0123';
    const messageTime = Date.now();
    const messageStatus = 'unapproved';
    const messageType = 'eth_signTypedData';
    const messageData = typedMessage;
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

  it('should reject a message', async () => {
    const controller = new TypedMessageManager();
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const version = 'V1';
    const messageData = typedMessage;
    const result = controller.addUnapprovedMessageAsync(
      {
        data: messageData,
        from,
      },
      version,
    );
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
    const controller = new TypedMessageManager();
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const version = 'V1';
    const rawSig = '0x5f7a0';
    const messageData = typedMessage;
    const result = controller.addUnapprovedMessageAsync(
      {
        data: messageData,
        from,
      },
      version,
    );
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

  it("should set message status as 'errored'", async () => {
    const controller = new TypedMessageManager();
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const version = 'V1';
    const messageData = typedMessage;
    const result = controller.addUnapprovedMessageAsync(
      {
        data: messageData,
        from,
      },
      version,
    );
    const unapprovedMessages = controller.getUnapprovedMessages();
    const keys = Object.keys(unapprovedMessages);
    controller.hub.once(`${keys[0]}:finished`, () => {
      expect(unapprovedMessages[keys[0]].messageParams.from).toBe(from);
      expect(unapprovedMessages[keys[0]].status).toBe('errored');
    });
    controller.setMessageStatusErrored(keys[0], 'error message');
    await expect(result).rejects.toThrow(
      'MetaMask Typed Message Signature: error message',
    );
  });

  it('should throw when unapproved finishes', async () => {
    const controller = new TypedMessageManager();
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const version = 'V1';
    const messageData = typedMessage;
    const result = controller.addUnapprovedMessageAsync(
      {
        data: messageData,
        from,
      },
      version,
    );
    const unapprovedMessages = controller.getUnapprovedMessages();
    const keys = Object.keys(unapprovedMessages);
    controller.hub.emit(`${keys[0]}:finished`, unapprovedMessages[keys[0]]);
    await expect(result).rejects.toThrow('Unknown problem');
  });

  it('should add a valid unapproved message', async () => {
    const controller = new TypedMessageManager();
    const messageStatus = 'unapproved';
    const messageType = 'eth_signTypedData';
    const version = 'version';
    const messageData = typedMessage;
    const messageParams = {
      data: messageData,
      from: '0xfoO',
    };
    const originalRequest = { origin: 'origin' };
    const messageId = controller.addUnapprovedMessage(
      messageParams,
      version,
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

  it('should throw when adding invalid legacy typed message', async () => {
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const messageData = '0x879';
    const version = 'V1';
    const controller = new TypedMessageManager();
    await expect(
      controller.addUnapprovedMessageAsync(
        {
          data: messageData,
          from,
        },
        version,
      ),
    ).rejects.toThrow('Invalid message "data":');
  });

  it('should throw when adding invalid typed message', async () => {
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const messageData = typedMessage;
    const version = 'V3';
    const controller = new TypedMessageManager();
    await expect(
      controller.addUnapprovedMessageAsync(
        {
          data: messageData,
          from,
        },
        version,
      ),
    ).rejects.toThrow('Invalid message "data":');
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
    const controller = new TypedMessageManager();
    controller.addMessage(firstMessage);
    controller.addMessage(secondMessage);
    expect(controller.getUnapprovedMessagesCount()).toStrictEqual(2);
    expect(controller.getUnapprovedMessages()).toStrictEqual({
      [firstMessage.id]: firstMessage,
      [secondMessage.id]: secondMessage,
    });
  });

  it('should approve typed message', async () => {
    const controller = new TypedMessageManager();
    const messageData = typedMessage;
    const firstMessage = { from: '0xfoO', data: messageData };
    const version = 'V1';
    const messageId = controller.addUnapprovedMessage(firstMessage, version);
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
    expect(message.status).toStrictEqual('approved');
  });

  it('should set message status signed', () => {
    const controller = new TypedMessageManager();
    const messageData = typedMessage;
    const firstMessage = { from: '0xfoO', data: messageData };
    const version = 'V1';
    const rawSig = '0x5f7a0';
    const messageId = controller.addUnapprovedMessage(firstMessage, version);
    controller.setMessageStatusSigned(messageId, rawSig);
    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.rawSig).toStrictEqual(rawSig);
    expect(message.status).toStrictEqual('signed');
  });

  it('should reject message', () => {
    const controller = new TypedMessageManager();
    const messageData = typedMessage;
    const firstMessage = { from: '0xfoO', data: messageData };
    const version = 'V1';
    const messageId = controller.addUnapprovedMessage(firstMessage, version);
    controller.rejectMessage(messageId);
    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.status).toStrictEqual('rejected');
  });

  it('should set message status errored', () => {
    const controller = new TypedMessageManager();
    const messageData = typedMessage;
    const firstMessage = { from: '0xfoO', data: messageData };
    const version = 'V1';
    const messageId = controller.addUnapprovedMessage(firstMessage, version);
    controller.setMessageStatusErrored(messageId, 'errored');
    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.status).toStrictEqual('errored');
  });
});
