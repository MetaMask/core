import type { SIWEMessage } from '@metamask/controller-utils';
import { detectSIWE, ORIGIN_METAMASK } from '@metamask/controller-utils';
import { SignTypedDataVersion } from '@metamask/keyring-controller';
import { LogType, SigningStage } from '@metamask/logging-controller';
import { v1 } from 'uuid';

import { flushPromises } from '../../../tests/helpers';
import type {
  SignatureControllerMessenger,
  SignatureControllerOptions,
  SignatureControllerState,
} from './SignatureController';
import { SignatureController } from './SignatureController';
import type {
  MessageParamsPersonal,
  MessageParamsTyped,
  OriginalRequest,
  SignatureRequest,
} from './types';
import { SignatureRequestStatus, SignatureRequestType } from './types';
import {
  normalizePersonalMessageParams,
  normalizeTypedMessageParams,
} from './utils/normalize';

jest.mock('uuid');
jest.mock('./utils/validation');
jest.mock('./utils/normalize');

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  detectSIWE: jest.fn(),
}));

const ID_MOCK = '123-456';
const CHAIN_ID_MOCK = '0x1';
const NETWORK_CLIENT_ID_MOCK = 'testNetworkClientId';
const FROM_MOCK = '0x456DEF';
const DATA_MOCK = '0xABC123';
const SIGNATURE_HASH_MOCK = '0x123ABC';
const ERROR_MESSAGE_MOCK = 'Test Error Message';
const ERROR_CODE_MOCK = 1234;
const ORIGIN_MOCK = 'testOrigin';

const PARAMS_MOCK = {
  data: DATA_MOCK,
  from: FROM_MOCK,
  metamaskId: ID_MOCK,
  origin: ORIGIN_MOCK,
  version: SignTypedDataVersion.V1,
};

const REQUEST_MOCK = {
  networkClientId: NETWORK_CLIENT_ID_MOCK,
};

const SIGNATURE_REQUEST_MOCK: SignatureRequest = {
  chainId: CHAIN_ID_MOCK,
  id: ID_MOCK,
  messageParams: PARAMS_MOCK,
  networkClientId: NETWORK_CLIENT_ID_MOCK,
  status: SignatureRequestStatus.Signed,
  time: Date.now(),
  type: SignatureRequestType.PersonalSign,
};

const PERMIT_PARAMS_MOCK = {
  data: '{"types":{"EIP712Domain":[{"name":"name","type":"string"},{"name":"version","type":"string"},{"name":"chainId","type":"uint256"},{"name":"verifyingContract","type":"address"}],"Permit":[{"name":"owner","type":"address"},{"name":"spender","type":"address"},{"name":"value","type":"uint256"},{"name":"nonce","type":"uint256"},{"name":"deadline","type":"uint256"}]},"primaryType":"Permit","domain":{"name":"MyToken","version":"1","verifyingContract":"0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC","chainId":1},"message":{"owner":"0x975e73efb9ff52e23bac7f7e043a1ecd06d05477","spender":"0x5B38Da6a701c568545dCfcB03FcB875f56beddC4","value":3000,"nonce":0,"deadline":50000000000}}',
  from: '0x975e73efb9ff52e23bac7f7e043a1ecd06d05477',
  version: 'V4',
  signatureMethod: 'eth_signTypedData_v4',
};

const PERMIT_REQUEST_MOCK = {
  method: 'eth_signTypedData_v4',
  params: [
    '0x975e73efb9ff52e23bac7f7e043a1ecd06d05477',
    '{"types":{"EIP712Domain":[{"name":"name","type":"string"},{"name":"version","type":"string"},{"name":"chainId","type":"uint256"},{"name":"verifyingContract","type":"address"}],"Permit":[{"name":"owner","type":"address"},{"name":"spender","type":"address"},{"name":"value","type":"uint256"},{"name":"nonce","type":"uint256"},{"name":"deadline","type":"uint256"}]},"primaryType":"Permit","domain":{"name":"MyToken","version":"1","verifyingContract":"0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC","chainId":1},"message":{"owner":"0x975e73efb9ff52e23bac7f7e043a1ecd06d05477","spender":"0x5B38Da6a701c568545dCfcB03FcB875f56beddC4","value":3000,"nonce":0,"deadline":50000000000}}',
  ],
  jsonrpc: '2.0',
  id: 1680528590,
  origin: 'https://metamask.github.io',
  networkClientId: 'mainnet',
  tabId: 1048807181,
  traceContext: null,
};

/**
 * Create a mock messenger instance.
 * @returns The mock messenger instance plus individual mock functions for each action.
 */
function createMessengerMock() {
  const loggingControllerAddMock = jest.fn();
  const approvalControllerAddRequestMock = jest.fn();
  const keyringControllerSignPersonalMessageMock = jest.fn();
  const keyringControllerSignTypedMessageMock = jest.fn();
  const networkControllerGetNetworkClientByIdMock = jest.fn();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const callMock = (method: string, ...args: any[]) => {
    switch (method) {
      case 'LoggingController:add':
        return loggingControllerAddMock(...args);
      case 'ApprovalController:addRequest':
        return approvalControllerAddRequestMock(...args);
      case 'KeyringController:signPersonalMessage':
        return keyringControllerSignPersonalMessageMock(...args);
      case 'KeyringController:signTypedMessage':
        return keyringControllerSignTypedMessageMock(...args);
      case 'NetworkController:getNetworkClientById':
        return networkControllerGetNetworkClientByIdMock(...args);
      default:
        throw new Error(`Messenger method not recognised: ${method}`);
    }
  };

  const messenger = {
    registerActionHandler: jest.fn(),
    registerInitialEventPayload: jest.fn(),
    publish: jest.fn(),
    call: callMock,
  } as unknown as jest.Mocked<SignatureControllerMessenger>;

  approvalControllerAddRequestMock.mockResolvedValue({});
  loggingControllerAddMock.mockResolvedValue({});

  networkControllerGetNetworkClientByIdMock.mockReturnValue({
    configuration: {
      chainId: CHAIN_ID_MOCK,
    },
  });

  return {
    approvalControllerAddRequestMock,
    keyringControllerSignPersonalMessageMock,
    keyringControllerSignTypedMessageMock,
    loggingControllerAddMock,
    messenger,
  };
}

/**
 * Create a new instance of the SignatureController.
 * @param options - Optional overrides for the default options.
 * @returns The controller instance plus individual mock functions for each action.
 */
function createController(options?: Partial<SignatureControllerOptions>) {
  const messengerMocks = createMessengerMock();

  const controller = new SignatureController({
    messenger: messengerMocks.messenger,
    ...options,
  });

  return { controller, ...messengerMocks };
}

/**
 * Create a mock error.
 * @returns The mock error instance.
 */
function createErrorMock(): Error {
  const errorMock = new Error(ERROR_MESSAGE_MOCK);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (errorMock as any).code = ERROR_CODE_MOCK;
  return errorMock;
}

describe('SignatureController', () => {
  const normalizePersonalMessageParamsMock = jest.mocked(
    normalizePersonalMessageParams,
  );

  const normalizeTypedMessageParamsMock = jest.mocked(
    normalizeTypedMessageParams,
  );

  const detectSIWEMock = jest.mocked(detectSIWE);
  const uuidV1Mock = jest.mocked(v1);

  beforeEach(() => {
    jest.resetAllMocks();

    normalizePersonalMessageParamsMock.mockImplementation((params) => params);
    normalizeTypedMessageParamsMock.mockImplementation((params) => params);
    uuidV1Mock.mockReturnValue(ID_MOCK);
  });

  describe('unapprovedPersonalMessagesCount', () => {
    it('returns the number of unapproved personal messages in state', () => {
      const { controller } = createController({
        state: {
          unapprovedPersonalMsgCount: 3,
        } as SignatureControllerState,
      });

      expect(controller.unapprovedPersonalMessagesCount).toBe(3);
    });
  });

  describe('unapprovedTypedMessagesCount', () => {
    it('returns the number of unapproved typed messages in state', () => {
      const { controller } = createController({
        state: {
          unapprovedTypedMessagesCount: 3,
        } as SignatureControllerState,
      });

      expect(controller.unapprovedTypedMessagesCount).toBe(3);
    });
  });

  describe('messages', () => {
    it('returns the signature requests in state', () => {
      const { controller } = createController({
        state: {
          signatureRequests: {
            [ID_MOCK]: SIGNATURE_REQUEST_MOCK,
            '2': SIGNATURE_REQUEST_MOCK,
          },
        } as unknown as SignatureControllerState,
      });

      expect(controller.messages).toStrictEqual({
        [ID_MOCK]: SIGNATURE_REQUEST_MOCK,
        '2': SIGNATURE_REQUEST_MOCK,
      });
    });
  });

  describe('resetState', () => {
    it('resets the state to default state', () => {
      const { controller } = createController({
        state: {
          signatureRequests: {
            [ID_MOCK]: SIGNATURE_REQUEST_MOCK,
          },
          unapprovedPersonalMsgs: {
            [ID_MOCK]: SIGNATURE_REQUEST_MOCK,
          },
          unapprovedTypedMessages: {
            [ID_MOCK]: SIGNATURE_REQUEST_MOCK,
          },
          unapprovedPersonalMsgCount: 1,
          unapprovedTypedMessagesCount: 1,
        } as unknown as SignatureControllerState,
      });

      controller.resetState();

      expect(controller.state).toStrictEqual({
        signatureRequests: {},
        unapprovedPersonalMsgs: {},
        unapprovedTypedMessages: {},
        unapprovedPersonalMsgCount: 0,
        unapprovedTypedMessagesCount: 0,
      });
    });
  });

  describe('rejectUnapproved', () => {
    it('rejects all signature requests with unapproved status', () => {
      const signatureRequests = {
        '1': SIGNATURE_REQUEST_MOCK,
        '2': {
          ...SIGNATURE_REQUEST_MOCK,
          id: '2',
          status: SignatureRequestStatus.Unapproved,
        },
        '3': {
          ...SIGNATURE_REQUEST_MOCK,
          id: '3',
          type: SignatureRequestType.TypedSign,
          status: SignatureRequestStatus.Unapproved,
        },
      };

      const { controller } = createController({
        state: {
          signatureRequests,
        } as unknown as SignatureControllerState,
      });

      controller.rejectUnapproved();

      expect(controller.state.signatureRequests).toStrictEqual({
        '1': signatureRequests['1'],
        '2': {
          ...signatureRequests['2'],
          status: SignatureRequestStatus.Rejected,
        },
        '3': {
          ...signatureRequests['3'],
          status: SignatureRequestStatus.Rejected,
        },
      });
    });

    it('emits event if reason provided', () => {
      const signatureRequests = {
        '1': SIGNATURE_REQUEST_MOCK,
        '2': {
          ...SIGNATURE_REQUEST_MOCK,
          id: '2',
          status: SignatureRequestStatus.Unapproved,
        },
        '3': {
          ...SIGNATURE_REQUEST_MOCK,
          id: '3',
          type: SignatureRequestType.TypedSign,
          status: SignatureRequestStatus.Unapproved,
        },
      };

      const listener = jest.fn();

      const { controller } = createController({
        state: {
          signatureRequests,
        } as unknown as SignatureControllerState,
      });

      controller.hub.on('cancelWithReason', listener);

      controller.rejectUnapproved('Custom reason');

      expect(listener).toHaveBeenCalledTimes(2);

      expect(listener).toHaveBeenCalledWith({
        metadata: signatureRequests['2'],
        reason: 'Custom reason',
      });

      expect(listener).toHaveBeenCalledWith({
        metadata: signatureRequests['3'],
        reason: 'Custom reason',
      });
    });
  });

  describe('clearUnapproved', () => {
    it('deletes all signature requests with unapproved status', () => {
      const signatureRequests = {
        '1': SIGNATURE_REQUEST_MOCK,
        '2': {
          ...SIGNATURE_REQUEST_MOCK,
          id: '2',
          status: SignatureRequestStatus.Unapproved,
        },
        '3': {
          ...SIGNATURE_REQUEST_MOCK,
          id: '3',
          type: SignatureRequestType.TypedSign,
          status: SignatureRequestStatus.Unapproved,
        },
      };

      const { controller } = createController({
        state: {
          signatureRequests,
        } as unknown as SignatureControllerState,
      });

      controller.clearUnapproved();

      expect(controller.state.signatureRequests).toStrictEqual({
        '1': signatureRequests['1'],
      });
    });
  });

  describe.each([
    [
      'newUnsignedPersonalMessage',
      (
        controller: SignatureController,
        request: OriginalRequest,
        params?: Partial<MessageParamsPersonal>,
      ) =>
        controller.newUnsignedPersonalMessage(
          { ...PARAMS_MOCK, ...params },
          request,
        ),
      SignatureRequestType.PersonalSign,
    ],
    [
      'newUnsignedTypedMessage',
      (
        controller: SignatureController,
        request: OriginalRequest,
        params?: Partial<MessageParamsTyped>,
      ) =>
        controller.newUnsignedTypedMessage(
          { ...PARAMS_MOCK, ...params },
          request,
          SignTypedDataVersion.V1,
          { parseJsonData: false },
        ),
      SignatureRequestType.TypedSign,
    ],
  ])('%s', (_title: string, fn, type) => {
    it('throws if rejected', async () => {
      const { controller, approvalControllerAddRequestMock } =
        createController();

      const error = createErrorMock();

      approvalControllerAddRequestMock.mockRejectedValueOnce(error);

      await expect(
        controller.newUnsignedPersonalMessage({ ...PARAMS_MOCK }, REQUEST_MOCK),
      ).rejects.toMatchObject({
        message: ERROR_MESSAGE_MOCK,
        code: ERROR_CODE_MOCK,
      });
    });

    it('invokes success callback if approved', async () => {
      const resultCallbackSuccessMock = jest.fn();

      const {
        controller,
        approvalControllerAddRequestMock,
        keyringControllerSignPersonalMessageMock,
        keyringControllerSignTypedMessageMock,
      } = createController();

      approvalControllerAddRequestMock.mockResolvedValueOnce({
        resultCallbacks: {
          success: resultCallbackSuccessMock,
        },
      });

      keyringControllerSignPersonalMessageMock.mockResolvedValueOnce(
        SIGNATURE_HASH_MOCK,
      );

      keyringControllerSignTypedMessageMock.mockResolvedValueOnce(
        SIGNATURE_HASH_MOCK,
      );

      await fn(controller, REQUEST_MOCK);

      expect(resultCallbackSuccessMock).toHaveBeenCalledTimes(1);
      expect(resultCallbackSuccessMock).toHaveBeenCalledWith(
        SIGNATURE_HASH_MOCK,
      );
    });

    it('emits finished event if approved', async () => {
      const listener = jest.fn();

      const { controller } = createController();

      controller.hub.on(`${ID_MOCK}:finished`, listener);

      await fn(controller, REQUEST_MOCK);

      const state = controller.state.signatureRequests[ID_MOCK];

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(state);
    });

    it('emits finished event if rejected', async () => {
      const listener = jest.fn();

      const { controller, approvalControllerAddRequestMock } =
        createController();

      controller.hub.on(`${ID_MOCK}:finished`, listener);

      const errorMock = createErrorMock();

      approvalControllerAddRequestMock.mockRejectedValueOnce(errorMock);

      await fn(controller, REQUEST_MOCK).catch(() => {
        // Ignore error
      });

      const state = controller.state.signatureRequests[ID_MOCK];

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(state);
    });

    it('adds logs to logging controller if approved', async () => {
      const { controller, loggingControllerAddMock } = createController();

      await fn(controller, REQUEST_MOCK);

      expect(loggingControllerAddMock).toHaveBeenCalledTimes(2);

      expect(loggingControllerAddMock).toHaveBeenCalledWith({
        type: LogType.EthSignLog,
        data: {
          signingMethod: expect.any(String),
          stage: SigningStage.Proposed,
          signingData: expect.any(Object),
        },
      });

      expect(loggingControllerAddMock).toHaveBeenCalledWith({
        type: LogType.EthSignLog,
        data: {
          signingMethod: expect.any(String),
          stage: SigningStage.Signed,
          signingData: expect.any(Object),
        },
      });
    });

    it('adds logs to logging controller if rejected', async () => {
      const {
        controller,
        loggingControllerAddMock,
        approvalControllerAddRequestMock,
      } = createController();

      const errorMock = createErrorMock();

      approvalControllerAddRequestMock.mockRejectedValueOnce(errorMock);

      await expect(fn(controller, REQUEST_MOCK)).rejects.toThrow(errorMock);

      expect(loggingControllerAddMock).toHaveBeenCalledTimes(2);

      expect(loggingControllerAddMock).toHaveBeenCalledWith({
        type: LogType.EthSignLog,
        data: {
          signingMethod: expect.any(String),
          stage: SigningStage.Proposed,
          signingData: expect.any(Object),
        },
      });

      expect(loggingControllerAddMock).toHaveBeenCalledWith({
        type: LogType.EthSignLog,
        data: {
          signingMethod: expect.any(String),
          stage: SigningStage.Rejected,
          signingData: expect.any(Object),
        },
      });
    });

    it('populates origin from request if present', async () => {
      const { controller } = createController();

      await fn(controller, { ...REQUEST_MOCK, origin: 'test' });

      expect(
        controller.state.signatureRequests[ID_MOCK].messageParams.origin,
      ).toBe('test');
    });

    it('populates origin from message params if no request', async () => {
      const { controller } = createController();

      await fn(controller, REQUEST_MOCK);

      expect(
        controller.state.signatureRequests[ID_MOCK].messageParams.origin,
      ).toBe(ORIGIN_MOCK);
    });

    it('populates request ID from request', async () => {
      const { controller } = createController();

      await fn(controller, { ...REQUEST_MOCK, id: 123 });

      expect(
        controller.state.signatureRequests[ID_MOCK].messageParams.requestId,
      ).toBe(123);
    });

    it('populates metamask ID using ID', async () => {
      const { controller } = createController();

      await fn(controller, REQUEST_MOCK);

      expect(
        controller.state.signatureRequests[ID_MOCK].messageParams.metamaskId,
      ).toBe(ID_MOCK);
    });

    it('throws if no network client ID in request', async () => {
      const { controller } = createController();

      await expect(fn(controller, {} as OriginalRequest)).rejects.toThrow(
        'Network client ID not found in request',
      );
    });

    it('emits unapproved message event', async () => {
      const listener = jest.fn();

      const { controller } = createController();

      controller.hub.on('unapprovedMessage', listener);

      await fn(controller, REQUEST_MOCK);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({
        messageParams: PARAMS_MOCK,
        metamaskId: ID_MOCK,
      });
    });

    it('emits signed event after sign', async () => {
      const listener = jest.fn();

      const {
        controller,
        keyringControllerSignPersonalMessageMock,
        keyringControllerSignTypedMessageMock,
      } = createController();

      keyringControllerSignPersonalMessageMock.mockResolvedValueOnce(
        SIGNATURE_HASH_MOCK,
      );

      keyringControllerSignTypedMessageMock.mockResolvedValueOnce(
        SIGNATURE_HASH_MOCK,
      );

      controller.hub.on(`${type}:signed`, listener);

      await fn(controller, REQUEST_MOCK);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({
        signature: SIGNATURE_HASH_MOCK,
        messageId: ID_MOCK,
      });
    });

    it('emits sign error event if signing fails', async () => {
      const errorMock = createErrorMock();

      const listener = jest.fn();

      const {
        controller,
        keyringControllerSignTypedMessageMock,
        keyringControllerSignPersonalMessageMock,
      } = createController();

      controller.hub.on(`${ID_MOCK}:signError`, listener);

      keyringControllerSignPersonalMessageMock.mockRejectedValueOnce(errorMock);
      keyringControllerSignTypedMessageMock.mockRejectedValueOnce(errorMock);

      await fn(controller, REQUEST_MOCK).catch(() => {
        // Ignore error
      });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({
        error: errorMock,
      });
    });

    it('invokes error callback if signing fails', async () => {
      const resultCallbackErrorMock = jest.fn();

      const errorMock = createErrorMock();

      const {
        controller,
        approvalControllerAddRequestMock,
        keyringControllerSignPersonalMessageMock,
        keyringControllerSignTypedMessageMock,
      } = createController();

      approvalControllerAddRequestMock.mockResolvedValueOnce({
        resultCallbacks: {
          error: resultCallbackErrorMock,
        },
      });

      keyringControllerSignPersonalMessageMock.mockRejectedValueOnce(errorMock);
      keyringControllerSignTypedMessageMock.mockRejectedValueOnce(errorMock);

      await expect(fn(controller, REQUEST_MOCK)).rejects.toThrow(
        ERROR_MESSAGE_MOCK,
      );

      expect(resultCallbackErrorMock).toHaveBeenCalledTimes(1);
      expect(resultCallbackErrorMock).toHaveBeenCalledWith(errorMock);
    });

    it('requests approval', async () => {
      const { controller, approvalControllerAddRequestMock } =
        createController();

      await fn(controller, REQUEST_MOCK);

      expect(approvalControllerAddRequestMock).toHaveBeenCalledTimes(1);
      expect(approvalControllerAddRequestMock).toHaveBeenCalledWith(
        {
          expectsResult: true,
          id: ID_MOCK,
          origin: ORIGIN_MOCK,
          requestData: expect.objectContaining({
            data: PARAMS_MOCK.data,
            from: PARAMS_MOCK.from,
          }),
          type,
        },
        true,
      );
    });

    it('requests approval with internal origin if no origin provided', async () => {
      const { controller, approvalControllerAddRequestMock } =
        createController();

      await fn(controller, REQUEST_MOCK, { origin: undefined });

      expect(approvalControllerAddRequestMock).toHaveBeenCalledTimes(1);
      expect(approvalControllerAddRequestMock).toHaveBeenCalledWith(
        {
          expectsResult: true,
          id: ID_MOCK,
          origin: ORIGIN_METAMASK,
          requestData: expect.objectContaining({
            data: PARAMS_MOCK.data,
            from: PARAMS_MOCK.from,
          }),
          type,
        },
        true,
      );
    });

    it('persists network client ID and chain ID in metadata', async () => {
      const { controller } = createController();

      await fn(controller, REQUEST_MOCK);

      expect(controller.state.signatureRequests[ID_MOCK]).toStrictEqual(
        expect.objectContaining({
          chainId: CHAIN_ID_MOCK,
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        }),
      );
    });
  });

  describe('newUnsignedPersonalMessage', () => {
    it('returns signature hash if approved', async () => {
      const { controller, keyringControllerSignPersonalMessageMock } =
        createController();

      keyringControllerSignPersonalMessageMock.mockResolvedValueOnce(
        SIGNATURE_HASH_MOCK,
      );

      const result = await controller.newUnsignedPersonalMessage(
        { ...PARAMS_MOCK },
        REQUEST_MOCK,
      );

      expect(result).toBe(SIGNATURE_HASH_MOCK);
    });

    it('adds SIWE data', async () => {
      const { controller } = createController();

      const siweMock = {
        isSIWEMessage: true,
        parsedMessage: { domain: 'test' },
      } as SIWEMessage;

      detectSIWEMock.mockReturnValueOnce(siweMock);

      await controller.newUnsignedPersonalMessage(
        { ...PARAMS_MOCK },
        REQUEST_MOCK,
      );

      const messageParams = controller.state.signatureRequests[ID_MOCK]
        .messageParams as MessageParamsPersonal;

      expect(messageParams.siwe).toStrictEqual(siweMock);
    });
  });

  describe('newUnsignedTypedMessage', () => {
    it('returns signature hash if approved', async () => {
      const { controller, keyringControllerSignTypedMessageMock } =
        createController();

      keyringControllerSignTypedMessageMock.mockResolvedValueOnce(
        SIGNATURE_HASH_MOCK,
      );

      const result = await controller.newUnsignedTypedMessage(
        PARAMS_MOCK,
        REQUEST_MOCK,
        SignTypedDataVersion.V1,
        { parseJsonData: false },
      );

      expect(result).toBe(SIGNATURE_HASH_MOCK);
    });

    it.each([SignTypedDataVersion.V3, SignTypedDataVersion.V4])(
      'supports data as string with version %s',
      async (version) => {
        const { controller, keyringControllerSignTypedMessageMock } =
          createController();

        keyringControllerSignTypedMessageMock.mockResolvedValueOnce(
          SIGNATURE_HASH_MOCK,
        );

        const result = await controller.newUnsignedTypedMessage(
          {
            ...PARAMS_MOCK,
            data: JSON.stringify({ test: 123 }),
          },
          REQUEST_MOCK,
          version as SignTypedDataVersion,
          { parseJsonData: true },
        );

        expect(keyringControllerSignTypedMessageMock).toHaveBeenCalledWith(
          {
            ...PARAMS_MOCK,
            data: { test: 123 },
            version,
          },
          version,
        );

        expect(result).toBe(SIGNATURE_HASH_MOCK);
      },
    );

    it('ignores parseJsonData if version is V1', async () => {
      const { controller, keyringControllerSignTypedMessageMock } =
        createController();

      keyringControllerSignTypedMessageMock.mockResolvedValueOnce(
        SIGNATURE_HASH_MOCK,
      );

      const result = await controller.newUnsignedTypedMessage(
        {
          ...PARAMS_MOCK,
          data: JSON.stringify({ test: 123 }),
        },
        REQUEST_MOCK,
        SignTypedDataVersion.V1,
        { parseJsonData: true },
      );

      expect(keyringControllerSignTypedMessageMock).toHaveBeenCalledWith(
        {
          ...PARAMS_MOCK,
          data: JSON.stringify({ test: 123 }),
        },
        SignTypedDataVersion.V1,
      );

      expect(result).toBe(SIGNATURE_HASH_MOCK);
    });

    it('sets status to errored if signing fails', async () => {
      const { controller, keyringControllerSignTypedMessageMock } =
        createController();

      const errorMock = createErrorMock();

      keyringControllerSignTypedMessageMock.mockRejectedValueOnce(errorMock);

      await expect(
        controller.newUnsignedTypedMessage(
          PARAMS_MOCK,
          REQUEST_MOCK,
          SignTypedDataVersion.V3,
          { parseJsonData: false },
        ),
      ).rejects.toThrow(errorMock);

      expect(controller.state.signatureRequests[ID_MOCK].status).toBe(
        SignatureRequestStatus.Errored,
      );
      expect(controller.state.signatureRequests[ID_MOCK].error).toBe(
        ERROR_MESSAGE_MOCK,
      );
    });

    it('populates version in params', async () => {
      const { controller } = createController();

      await controller.newUnsignedTypedMessage(
        PARAMS_MOCK,
        REQUEST_MOCK,
        SignTypedDataVersion.V3,
        { parseJsonData: false },
      );

      expect(
        (
          controller.state.signatureRequests[ID_MOCK]
            .messageParams as MessageParamsTyped
        ).version,
      ).toBe(SignTypedDataVersion.V3);
    });

    it('invoke decoding api for permits', async () => {
      const { controller } = createController();

      await controller.newUnsignedTypedMessage(
        PERMIT_PARAMS_MOCK,
        PERMIT_REQUEST_MOCK,
        SignTypedDataVersion.V4,
        { parseJsonData: false },
      );

      await flushPromises();
      expect(controller.state.signatureRequests[ID_MOCK].decodedRequest).toBe(
        'IN_PROGRESS',
      );
    });
  });

  describe('setDeferredSignSuccess', () => {
    it('sets the signature and status on the signature request', () => {
      const { controller } = createController({
        state: {
          signatureRequests: {
            [ID_MOCK]: {
              ...SIGNATURE_REQUEST_MOCK,
              status: SignatureRequestStatus.InProgress,
            },
          },
        } as unknown as SignatureControllerState,
      });

      controller.setDeferredSignSuccess(ID_MOCK, SIGNATURE_HASH_MOCK);

      expect(controller.state.signatureRequests[ID_MOCK].rawSig).toBe(
        SIGNATURE_HASH_MOCK,
      );

      expect(controller.state.signatureRequests[ID_MOCK].status).toBe(
        SignatureRequestStatus.Signed,
      );
    });

    it('resolves defered signature request', async () => {
      const { controller } = createController();
      let resolved = false;

      const signaturePromise = controller
        .newUnsignedPersonalMessage(
          {
            ...PARAMS_MOCK,
            deferSetAsSigned: true,
          },
          REQUEST_MOCK,
        )
        .then((result) => {
          resolved = true;
          return result;
        });

      await flushPromises();

      expect(resolved).toBe(false);

      controller.setDeferredSignSuccess(ID_MOCK, SIGNATURE_HASH_MOCK);

      await flushPromises();

      expect(resolved).toBe(true);
      expect(await signaturePromise).toBe(SIGNATURE_HASH_MOCK);
    });

    it('throws if signature request not found', () => {
      const { controller } = createController();

      expect(() => {
        controller.setDeferredSignSuccess(ID_MOCK, SIGNATURE_HASH_MOCK);
      }).toThrow(`Signature request with id ${ID_MOCK} not found`);
    });
  });

  describe('setMessageMetadata', () => {
    it('sets the metadata on the signature request', () => {
      const { controller } = createController({
        state: {
          signatureRequests: {
            [ID_MOCK]: SIGNATURE_REQUEST_MOCK,
          },
        } as unknown as SignatureControllerState,
      });

      controller.setMessageMetadata(ID_MOCK, { test: 123 });

      expect(
        controller.state.signatureRequests[ID_MOCK].metadata,
      ).toStrictEqual({
        test: 123,
      });
    });
  });

  describe('setDeferredSignError', () => {
    it('sets the status on the signature request to rejected', () => {
      const { controller } = createController({
        state: {
          signatureRequests: {
            [ID_MOCK]: {
              ...SIGNATURE_REQUEST_MOCK,
              status: SignatureRequestStatus.InProgress,
            },
          },
        } as unknown as SignatureControllerState,
      });

      controller.setDeferredSignError(ID_MOCK);

      expect(controller.state.signatureRequests[ID_MOCK].status).toBe(
        SignatureRequestStatus.Rejected,
      );
    });

    it('rejects defered signature request', async () => {
      const { controller } = createController();
      let rejectedError;

      controller
        .newUnsignedPersonalMessage(
          {
            ...PARAMS_MOCK,
            deferSetAsSigned: true,
          },
          REQUEST_MOCK,
        )
        .catch((error) => {
          rejectedError = error;
        });

      await flushPromises();

      expect(rejectedError).toBeUndefined();

      controller.setDeferredSignError(ID_MOCK);

      await flushPromises();

      expect(rejectedError).toStrictEqual(
        new Error(
          'MetaMask personal_sign Signature: User denied message signature.',
        ),
      );
    });
  });

  describe.each([
    'setTypedMessageInProgress',
    'setPersonalMessageInProgress',
  ] as const)('%s', (fn) => {
    it('sets the status on the signature request to in progress', () => {
      const { controller } = createController({
        state: {
          signatureRequests: {
            [ID_MOCK]: {
              ...SIGNATURE_REQUEST_MOCK,
              status: SignatureRequestStatus.Unapproved,
            },
          },
        } as unknown as SignatureControllerState,
      });

      controller[fn](ID_MOCK);

      expect(controller.state.signatureRequests[ID_MOCK].status).toBe(
        SignatureRequestStatus.InProgress,
      );
    });
  });
});
