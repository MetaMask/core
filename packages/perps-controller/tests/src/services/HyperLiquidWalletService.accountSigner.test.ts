import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';

import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { HyperLiquidWalletService } from '../../../src/services/HyperLiquidWalletService.js';
import type {
  PerpsAccountSigner,
  PerpsTypedDataPayload,
} from '../../../src/types/index.js';
import type { PerpsControllerMessengerBase } from '../../../src/types/messenger.js';
import {
  createMockEvmAccount,
  createMockInfrastructure,
  createMockMessenger,
} from '../../helpers/serviceMocks.js';

const SIGNATURE = `0x${'cd'.repeat(65)}` as const;

const TYPED_DATA: PerpsTypedDataPayload = {
  domain: {
    name: 'Exchange',
    version: '1',
    chainId: 1337,
    verifyingContract: '0x0000000000000000000000000000000000000000',
  },
  types: {
    Agent: [
      { name: 'source', type: 'string' },
      { name: 'connectionId', type: 'bytes32' },
    ],
  },
  primaryType: 'Agent',
  message: { source: 'b', connectionId: `0x${'11'.repeat(32)}` },
};

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<PerpsControllerMessengerBase>,
  MessengerEvents<PerpsControllerMessengerBase>
>;

type HostMessenger = {
  messenger: PerpsControllerMessengerBase;
  call: jest.SpyInstance;
};

/**
 * Build a real messenger that only knows the selected account, like a host
 * without a KeyringController. Any `KeyringController:*` call throws.
 *
 * @param keyringType - Keyring type reported in the account metadata.
 * @returns The PerpsController-namespaced messenger and a spy on its `call`.
 */
function buildHostMessenger(keyringType = 'HD Key Tree'): HostMessenger {
  const account = createMockEvmAccount();
  const root: RootMessenger = new Messenger({ namespace: MOCK_ANY_NAMESPACE });
  const messenger: PerpsControllerMessengerBase = new Messenger({
    namespace: 'PerpsController',
    parent: root,
  });
  root.registerActionHandler('AccountsController:getSelectedAccount', () => ({
    ...account,
    scopes: ['eip155:0'],
    metadata: { ...account.metadata, keyring: { type: keyringType } },
  }));
  root.delegate({
    actions: ['AccountsController:getSelectedAccount'],
    messenger,
  });
  return { messenger, call: jest.spyOn(messenger, 'call') };
}

function keyringCalls(call: jest.SpyInstance): string[] {
  return call.mock.calls
    .map(([action]: [string]) => action)
    .filter((action) => action.startsWith('KeyringController:'));
}

describe('HyperLiquidWalletService with accountSigner', () => {
  const { address } = createMockEvmAccount();

  function buildService(
    accountSigner: PerpsAccountSigner,
    keyringType?: string,
  ): { service: HyperLiquidWalletService; host: HostMessenger } {
    const host = buildHostMessenger(keyringType);
    const deps = { ...createMockInfrastructure(), accountSigner };
    return {
      service: new HyperLiquidWalletService(deps, host.messenger, {
        isTestnet: true,
      }),
      host,
    };
  }

  it('signs typed data through the account signer without KeyringController', async () => {
    const signTypedData = jest.fn().mockResolvedValue(SIGNATURE);
    const { service, host } = buildService({ signTypedData });

    const signature = await service
      .createWalletAdapter()
      .signTypedData(TYPED_DATA);

    expect(signature).toBe(SIGNATURE);
    expect(signTypedData).toHaveBeenCalledTimes(1);
    expect(signTypedData).toHaveBeenCalledWith(address, TYPED_DATA);
    expect(keyringCalls(host.call)).toStrictEqual([]);
  });

  it('propagates account signer rejections', async () => {
    const signTypedData = jest
      .fn()
      .mockRejectedValue(new Error('User rejected the request.'));
    const { service } = buildService({ signTypedData });

    await expect(
      service.createWalletAdapter().signTypedData(TYPED_DATA),
    ).rejects.toThrow('User rejected the request.');
  });

  it('reports ready when isReady is omitted', () => {
    const { service, host } = buildService({ signTypedData: jest.fn() });

    expect(service.isKeyringUnlocked()).toBe(true);
    expect(keyringCalls(host.call)).toStrictEqual([]);
  });

  it('fails with KEYRING_LOCKED and does not sign when isReady returns false', async () => {
    const signTypedData = jest.fn().mockResolvedValue(SIGNATURE);
    const { service, host } = buildService({
      signTypedData,
      isReady: () => false,
    });

    expect(service.isKeyringUnlocked()).toBe(false);
    await expect(
      service.createWalletAdapter().signTypedData(TYPED_DATA),
    ).rejects.toThrow(PERPS_ERROR_CODES.KEYRING_LOCKED);
    expect(signTypedData).not.toHaveBeenCalled();
    expect(keyringCalls(host.call)).toStrictEqual([]);
  });

  it('uses isHardwareWallet instead of the account keyring type', () => {
    const { service: hardware } = buildService(
      { signTypedData: jest.fn(), isHardwareWallet: () => true },
      'HD Key Tree',
    );
    const { service: defaulted } = buildService(
      { signTypedData: jest.fn() },
      'Ledger Hardware',
    );

    expect(hardware.isSelectedHardwareWallet()).toBe(true);
    expect(defaulted.isSelectedHardwareWallet()).toBe(false);
  });
});

describe('HyperLiquidWalletService without accountSigner', () => {
  it('keeps signing through KeyringController:signTypedMessage V4', async () => {
    const messenger = createMockMessenger();
    const call = jest.spyOn(messenger, 'call');
    const service = new HyperLiquidWalletService(
      createMockInfrastructure(),
      messenger,
    );

    const signature = await service
      .createWalletAdapter()
      .signTypedData(TYPED_DATA);

    expect(signature).toBe('0xSignatureResult');
    expect(call).toHaveBeenCalledWith('KeyringController:getState');
    expect(call).toHaveBeenCalledWith(
      'KeyringController:signTypedMessage',
      { from: createMockEvmAccount().address, data: TYPED_DATA },
      'V4',
    );
  });

  it('fails when no KeyringController handler is delegated', async () => {
    const host = buildHostMessenger();
    const service = new HyperLiquidWalletService(
      createMockInfrastructure(),
      host.messenger,
    );

    await expect(
      service.createWalletAdapter().signTypedData(TYPED_DATA),
    ).rejects.toThrow(
      'A handler for KeyringController:getState has not been delegated to PerpsController',
    );
  });
});
