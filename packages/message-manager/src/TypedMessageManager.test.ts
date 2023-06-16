import { TypedMessageManager } from './TypedMessageManager';

let controller: TypedMessageManager;

const fromMock = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
const messageIdMock = 'message-id-mocked';
const rawSigMock = '0xsignaturemocked';
const versionMock = 'V1';

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
  beforeEach(() => {
    controller = new TypedMessageManager();
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
    const messageTime = Date.now();
    const messageStatus = 'unapproved';
    const messageType = 'eth_signTypedData';
    const messageData = typedMessage;
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
      const promise = controller.addUnapprovedMessageAsync(
        {
          data: typedMessage,
          from: fromMock,
        },
        versionMock,
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
      const promise = controller.addUnapprovedMessageAsync(
        {
          data: typedMessage,
          from: fromMock,
        },
        versionMock,
      );

      setTimeout(() => {
        controller.hub.emit(`${messageIdMock}:finished`, {
          status: 'rejected',
        });
      }, 100);

      await expect(() => promise).rejects.toThrow(
        'MetaMask Typed Message Signature: User denied message signature.',
      );
    });

    it('rejects with an error when status is "errored"', async () => {
      const promise = controller.addUnapprovedMessageAsync(
        {
          data: typedMessage,
          from: fromMock,
        },
        versionMock,
      );

      setTimeout(() => {
        controller.hub.emit(`${messageIdMock}:finished`, {
          status: 'errored',
          error: 'error message',
        });
      }, 100);

      await expect(() => promise).rejects.toThrow(
        'MetaMask Typed Message Signature: error message',
      );
    });

    it('rejects with an error when unapproved finishes', async () => {
      const promise = controller.addUnapprovedMessageAsync(
        {
          data: typedMessage,
          from: fromMock,
        },
        versionMock,
      );

      setTimeout(() => {
        controller.hub.emit(`${messageIdMock}:finished`, {
          status: 'unknown',
        });
      }, 100);

      await expect(() => promise).rejects.toThrow(
        `MetaMask Typed Message Signature: Unknown problem: ${JSON.stringify({
          data: typedMessage,
          from: fromMock,
        })}`,
      );
    });
  });

  it('should add a valid unapproved message', async () => {
    const messageStatus = 'unapproved';
    const messageType = 'eth_signTypedData';
    const version = 'version';
    const messageData = typedMessage;
    const messageParams = {
      data: messageData,
      from: '0xfoO',
    };
    const originalRequest = { origin: 'origin' };
    const messageId = await controller.addUnapprovedMessage(
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
    const mockGetChainId = jest.fn();
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const messageData = typedMessage;
    const version = 'V3';
    await expect(
      controller.addUnapprovedMessageAsync(
        {
          data: messageData,
          from,
        },
        version,
      ),
    ).rejects.toThrow('Invalid message "data":');

    const controllerWithGetCurrentChainIdCallback = new TypedMessageManager(
      undefined,
      undefined,
      undefined,
      undefined,
      mockGetChainId,
    );
    await expect(
      controllerWithGetCurrentChainIdCallback.addUnapprovedMessageAsync(
        {
          data: messageData,
          from,
        },
        'V4',
      ),
    ).rejects.toThrow('Invalid message "data":');
    expect(mockGetChainId).toHaveBeenCalled();
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
    await controller.addMessage(firstMessage);
    await controller.addMessage(secondMessage);
    expect(controller.getUnapprovedMessagesCount()).toStrictEqual(2);
    expect(controller.getUnapprovedMessages()).toStrictEqual({
      [firstMessage.id]: firstMessage,
      [secondMessage.id]: secondMessage,
    });
  });

  it('should approve typed message', async () => {
    const messageData = typedMessage;
    const firstMessage = { from: '0xfoO', data: messageData };
    const version = 'V1';
    const messageId = await await controller.addUnapprovedMessage(
      firstMessage,
      version,
    );
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

  it('should set message status signed', async () => {
    const messageData = typedMessage;
    const firstMessage = { from: '0xfoO', data: messageData };
    const version = 'V1';
    const rawSig = '0x5f7a0';
    const messageId = await controller.addUnapprovedMessage(
      firstMessage,
      version,
    );
    controller.setMessageStatusSigned(messageId, rawSig);
    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.rawSig).toStrictEqual(rawSig);
    expect(message.status).toStrictEqual('signed');
  });

  it('should reject message', async () => {
    const messageData = typedMessage;
    const firstMessage = { from: '0xfoO', data: messageData };
    const version = 'V1';
    const messageId = await controller.addUnapprovedMessage(
      firstMessage,
      version,
    );
    controller.rejectMessage(messageId);
    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.status).toStrictEqual('rejected');
  });

  it('should set message status errored', async () => {
    const messageData = typedMessage;
    const firstMessage = { from: '0xfoO', data: messageData };
    const version = 'V1';
    const messageId = await controller.addUnapprovedMessage(
      firstMessage,
      version,
    );
    controller.setMessageStatusErrored(messageId, 'errored');
    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.status).toStrictEqual('errored');
  });
});
