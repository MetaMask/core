import type { Hex } from '@metamask/utils';

import { associateAddress } from './associate-address';
import type { StepContext } from './types';
import type { UpgradeConfig } from '../types';

const MOCK_ADDRESS = '0xabcdef1234567890abcdef1234567890abcdef12' as Hex;
const MOCK_CHAIN_ID = '0x1' as Hex;
const MOCK_SIGNATURE = '0xdeadbeef' as Hex;

type Handlers = {
  'KeyringController:signPersonalMessage'?: jest.Mock;
  'ChompApiService:associateAddress'?: jest.Mock;
};

function buildContext(handlers: Handlers = {}): {
  context: StepContext;
  call: jest.Mock;
} {
  const call = jest.fn((action: string, ...args: unknown[]) => {
    const handler = handlers[action as keyof Handlers];
    if (!handler) {
      throw new Error(`No handler registered for ${action}`);
    }
    return handler(...args);
  });
  const context: StepContext = {
    messenger: { call } as unknown as StepContext['messenger'],
    config: {} as UpgradeConfig,
    address: MOCK_ADDRESS,
    chainId: MOCK_CHAIN_ID,
    entry: undefined,
  };
  return { context, call };
}

describe('associateAddress', () => {
  it('signs a timestamped CHOMP Authentication message', async () => {
    const signPersonalMessage = jest.fn().mockResolvedValue(MOCK_SIGNATURE);
    const { context } = buildContext({
      'KeyringController:signPersonalMessage': signPersonalMessage,
      'ChompApiService:associateAddress': jest.fn().mockResolvedValue({}),
    });

    await associateAddress(context);

    expect(signPersonalMessage).toHaveBeenCalledWith({
      data: expect.stringMatching(/^CHOMP Authentication \d+$/u),
      from: MOCK_ADDRESS,
    });
  });

  it('submits the signature, timestamp, and address to CHOMP', async () => {
    const associate = jest.fn().mockResolvedValue({});
    const { context } = buildContext({
      'KeyringController:signPersonalMessage': jest
        .fn()
        .mockResolvedValue(MOCK_SIGNATURE),
      'ChompApiService:associateAddress': associate,
    });

    await associateAddress(context);

    expect(associate).toHaveBeenCalledWith({
      signature: MOCK_SIGNATURE,
      timestamp: expect.stringMatching(/^\d+$/u),
      address: MOCK_ADDRESS,
    });
  });

  it('returns a patch marking associate-address complete', async () => {
    const { context } = buildContext({
      'KeyringController:signPersonalMessage': jest
        .fn()
        .mockResolvedValue(MOCK_SIGNATURE),
      'ChompApiService:associateAddress': jest.fn().mockResolvedValue({}),
    });

    expect(await associateAddress(context)).toStrictEqual({
      step: 'associate-address',
    });
  });

  it('propagates signing errors', async () => {
    const { context } = buildContext({
      'KeyringController:signPersonalMessage': jest
        .fn()
        .mockRejectedValue(new Error('signing failed')),
    });

    await expect(associateAddress(context)).rejects.toThrow('signing failed');
  });
});
