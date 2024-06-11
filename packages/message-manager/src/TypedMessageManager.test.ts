import { TypedMessageManager } from './TypedMessageManager';

let controller: TypedMessageManager;
const getCurrentChainIdStub = jest.fn();

const fromMock = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';

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

const typedMessageV3V4 = {
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    Person: [
      { name: 'name', type: 'string' },
      { name: 'wallet', type: 'address' },
    ],
    Mail: [
      { name: 'from', type: 'Person' },
      { name: 'to', type: 'Person' },
      { name: 'contents', type: 'string' },
    ],
  },
  primaryType: 'Mail',
  domain: {
    name: 'Ether Mail',
    version: '1',
    chainId: 1,
    verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
  },
  message: {
    from: { name: 'Cow', wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826' },
    to: { name: 'Bob', wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' },
    contents: 'Hello, Bob!',
  },
};

describe('TypedMessageManager', () => {
  beforeEach(() => {
    controller = new TypedMessageManager(
      undefined,
      undefined,
      undefined,
      undefined,
      getCurrentChainIdStub,
    );
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

  it('should throw when adding a valid unapproved message when getCurrentChainId is undefined', async () => {
    controller = new TypedMessageManager();
    const version = 'V3';
    const messageData = JSON.stringify(typedMessageV3V4);
    const messageParams = {
      data: messageData,
      from: fromMock,
    };
    const originalRequest = { origin: 'origin' };

    await expect(
      controller.addUnapprovedMessage(messageParams, originalRequest, version),
    ).rejects.toThrow('Current chainId cannot be null or undefined.');
  });

  it('should add a valid unapproved message', async () => {
    const messageStatus = 'unapproved';
    const messageType = 'eth_signTypedData';
    const version = 'version';
    const messageData = typedMessage;
    const messageParams = {
      data: messageData,
      from: fromMock,
    };
    const originalRequest = {
      origin: 'origin',
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      securityAlertResponse: { result_type: 'result_type', reason: 'reason' },
    };
    const messageId = await controller.addUnapprovedMessage(
      messageParams,
      originalRequest,
      version,
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

  it('should add a valid V3 unapproved message as a JSON-parseable string', async () => {
    getCurrentChainIdStub.mockImplementation(() => 1);
    const messageStatus = 'unapproved';
    const messageType = 'eth_signTypedData';
    const version = 'V3';
    const messageData = JSON.stringify(typedMessageV3V4);
    const messageParams = {
      data: messageData,
      from: fromMock,
    };
    const originalRequest = { origin: 'origin' };
    const messageId = await controller.addUnapprovedMessage(
      messageParams,
      originalRequest,
      version,
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
  });

  it('should add a valid V3 unapproved message as an object', async () => {
    getCurrentChainIdStub.mockImplementation(() => 1);
    const messageStatus = 'unapproved';
    const messageType = 'eth_signTypedData';
    const version = 'V3';
    const messageData = typedMessageV3V4;
    const messageParams = {
      data: messageData,
      from: fromMock,
    };
    const originalRequest = { origin: 'origin' };
    const messageId = await controller.addUnapprovedMessage(
      messageParams,
      originalRequest,
      version,
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
  });

  it('should throw when adding invalid legacy typed message', async () => {
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const messageData = '0x879';
    const version = 'V1';
    await expect(
      controller.addUnapprovedMessage(
        {
          data: messageData,
          from,
        },
        undefined,
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
      controller.addUnapprovedMessage(
        {
          data: messageData,
          from,
        },
        undefined,
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
      controllerWithGetCurrentChainIdCallback.addUnapprovedMessage(
        {
          data: messageData,
          from,
        },
        undefined,
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
    expect(controller.getUnapprovedMessagesCount()).toBe(2);
    expect(controller.getUnapprovedMessages()).toStrictEqual({
      [firstMessage.id]: firstMessage,
      [secondMessage.id]: secondMessage,
    });
  });

  it('should approve typed message', async () => {
    const messageData = typedMessage;
    const firstMessage = { from: fromMock, data: messageData };
    const version = 'V1';
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/await-thenable
    const messageId = await await controller.addUnapprovedMessage(
      firstMessage,
      undefined,
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
    expect(message.status).toBe('approved');
  });

  it('should set message status signed', async () => {
    const messageData = typedMessage;
    const firstMessage = { from: fromMock, data: messageData };
    const version = 'V1';
    const rawSig = '0x5f7a0';
    const messageId = await controller.addUnapprovedMessage(
      firstMessage,
      undefined,
      version,
    );
    controller.setMessageStatusSigned(messageId, rawSig);
    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.rawSig).toStrictEqual(rawSig);
    expect(message.status).toBe('signed');
  });

  it('should reject message', async () => {
    const messageData = typedMessage;
    const firstMessage = { from: fromMock, data: messageData };
    const version = 'V1';
    const messageId = await controller.addUnapprovedMessage(
      firstMessage,
      undefined,
      version,
    );
    controller.rejectMessage(messageId);
    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.status).toBe('rejected');
  });

  it('should set message status errored', async () => {
    const messageData = typedMessage;
    const firstMessage = { from: fromMock, data: messageData };
    const version = 'V1';
    const messageId = await controller.addUnapprovedMessage(
      firstMessage,
      undefined,
      version,
    );
    controller.setMessageStatusErrored(messageId, 'errored');
    const message = controller.getMessage(messageId);
    if (!message) {
      throw new Error('"message" is falsy');
    }
    expect(message.status).toBe('errored');
  });
});
