import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { PerpsControllerMessengerBase } from '../types/messenger';
import { getSelectedEvmAccountFromMessenger } from './accountUtils';

const SELECTED_ADDRESS = '0x1111111111111111111111111111111111111111';
const GROUP_ADDRESS = '0x2222222222222222222222222222222222222222';

function buildEvmAccount(
  address: string,
  id: string,
): InternalAccount {
  return {
    address,
    id,
    type: 'eip155:eoa',
    options: {},
    methods: [],
    metadata: {
      name: id,
      importTime: Date.now(),
      keyring: {
        type: 'HD Key Tree',
      },
    },
    scopes: ['eip155:0'],
  } as InternalAccount;
}

describe('getSelectedEvmAccountFromMessenger', () => {
  it('prefers the selected account over the first evm account in the selected group', () => {
    const selectedAccount = buildEvmAccount(SELECTED_ADDRESS, 'selected');
    const groupedAccount = buildEvmAccount(GROUP_ADDRESS, 'grouped');
    const messenger = {
      call: jest.fn((actionType: string) => {
        switch (actionType) {
          case 'AccountsController:getSelectedAccount':
            return selectedAccount;
          case 'AccountTreeController:getAccountsFromSelectedAccountGroup':
            return [groupedAccount];
          default:
            throw new Error(`Unexpected action: ${actionType}`);
        }
      }),
    } as Pick<PerpsControllerMessengerBase, 'call'>;

    expect(getSelectedEvmAccountFromMessenger(messenger)).toStrictEqual({
      address: SELECTED_ADDRESS,
    });
  });

  it('falls back to the selected account group when selected account lookup is unavailable', () => {
    const groupedAccount = buildEvmAccount(GROUP_ADDRESS, 'grouped');
    const messenger = {
      call: jest.fn((actionType: string) => {
        switch (actionType) {
          case 'AccountsController:getSelectedAccount':
            throw new Error('Selected account unavailable');
          case 'AccountTreeController:getAccountsFromSelectedAccountGroup':
            return [groupedAccount];
          default:
            throw new Error(`Unexpected action: ${actionType}`);
        }
      }),
    } as Pick<PerpsControllerMessengerBase, 'call'>;

    expect(getSelectedEvmAccountFromMessenger(messenger)).toStrictEqual({
      address: GROUP_ADDRESS,
    });
  });
});
