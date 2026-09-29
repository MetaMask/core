import {
  AgentBindings,
  AgentSignerUnavailableError,
  isAgentSignerUnavailableError,
} from '../../../src/services/agentSigner.js';
import type { PerpsAgentAccount } from '../../../src/types/index.js';

const ACCOUNT: PerpsAgentAccount = {
  mainAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  isTestnet: false,
};
const AGENT = {
  address: '0x00000000000000000000000000000000000a9e17',
  signTypedData: jest.fn(),
} as const;

describe('AgentBindings', () => {
  it('releases a binding to the rejected agent whatever the address casing', async () => {
    const getAgentSigner = jest.fn().mockResolvedValue(null);
    const bindings = new AgentBindings(getAgentSigner);
    bindings.set(ACCOUNT, AGENT);

    bindings.release(
      { ...ACCOUNT, mainAddress: '0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD' },
      AGENT.address.toUpperCase().replace('0X', '0x'),
    );

    expect(await bindings.resolve(ACCOUNT)).toBeNull();
    expect(getAgentSigner).toHaveBeenCalledWith(ACCOUNT);
  });

  it('keeps a binding to another agent and a pin when an agent is rejected', async () => {
    const getAgentSigner = jest.fn().mockResolvedValue(AGENT);
    const bindings = new AgentBindings(getAgentSigner);
    const otherAccount: PerpsAgentAccount = { ...ACCOUNT, isTestnet: true };
    bindings.set(ACCOUNT, AGENT);
    bindings.set(otherAccount, null);

    bindings.release(ACCOUNT, '0x00000000000000000000000000000000000b0b02');
    bindings.release(otherAccount, AGENT.address);

    expect(await bindings.resolve(ACCOUNT)).toBe(AGENT);
    expect(await bindings.resolve(otherAccount)).toBeNull();
    expect(getAgentSigner).not.toHaveBeenCalled();
  });
});

describe('isAgentSignerUnavailableError', () => {
  it('finds the error anywhere in the cause chain', () => {
    const unavailable = new AgentSignerUnavailableError(new Error('down'));
    const wrapped = new Error(
      'Failed to sign the typed data using the wallet',
      {
        cause: unavailable,
      },
    );

    expect(isAgentSignerUnavailableError(wrapped)).toBe(true);
    expect(isAgentSignerUnavailableError(new Error('other'))).toBe(false);
  });
});
