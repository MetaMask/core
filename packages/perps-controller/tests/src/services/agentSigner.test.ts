import {
  AgentBindings,
  AgentSignerUnavailableError,
  isAgentSignerUnavailableError,
} from '../../../src/services/agentSigner.js';
import type { PerpsAgentAccount } from '../../../src/types/index.js';
import {
  AGENT_ADDRESS,
  OTHER_AGENT_ADDRESS,
  sdkSigningError,
} from '../../helpers/agentFixtures.js';

const ACCOUNT: PerpsAgentAccount = {
  mainAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  isTestnet: false,
};
const AGENT = {
  address: AGENT_ADDRESS,
  signTypedData: jest.fn(),
} as const;

describe('AgentBindings', () => {
  it('resolves no agent without getAgentSigner or a binding', async () => {
    const bindings = new AgentBindings(undefined);

    expect(await bindings.resolve(ACCOUNT)).toBeNull();
  });

  it('answers with a binding for its account and network only, and asks getAgentSigner for the others', async () => {
    const getAgentSigner = jest.fn().mockResolvedValue(null);
    const bindings = new AgentBindings(getAgentSigner);
    const otherAccount: PerpsAgentAccount = {
      ...ACCOUNT,
      mainAddress: '0x9999999999999999999999999999999999999999',
    };
    const testnetAccount: PerpsAgentAccount = { ...ACCOUNT, isTestnet: true };

    bindings.set(ACCOUNT, AGENT);

    expect(await bindings.resolve(ACCOUNT)).toBe(AGENT);
    expect(await bindings.resolve(otherAccount)).toBeNull();
    expect(await bindings.resolve(testnetAccount)).toBeNull();
    expect(getAgentSigner.mock.calls).toStrictEqual([
      [otherAccount],
      [testnetAccount],
    ]);
  });

  it('matches a binding whatever the main address casing', async () => {
    const getAgentSigner = jest.fn().mockResolvedValue(null);
    const bindings = new AgentBindings(getAgentSigner);

    bindings.set(ACCOUNT, AGENT);

    expect(
      await bindings.resolve({
        ...ACCOUNT,
        mainAddress: '0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD',
      }),
    ).toBe(AGENT);
    expect(getAgentSigner).not.toHaveBeenCalled();
  });

  it('forgets bindings and pins once cleared', async () => {
    const getAgentSigner = jest.fn().mockResolvedValue(null);
    const bindings = new AgentBindings(getAgentSigner);
    const otherAccount: PerpsAgentAccount = {
      ...ACCOUNT,
      mainAddress: '0x00000000000000000000000000000000000b0b01',
    };
    bindings.set(ACCOUNT, null);
    bindings.set(otherAccount, AGENT);

    bindings.clear();

    expect(await bindings.resolve(ACCOUNT)).toBeNull();
    expect(await bindings.resolve(otherAccount)).toBeNull();
    // Both now fall through to the host.
    expect(getAgentSigner.mock.calls).toStrictEqual([
      [ACCOUNT],
      [otherAccount],
    ]);
  });

  it('releases a binding to the rejected agent whatever the address casing', async () => {
    const getAgentSigner = jest.fn().mockResolvedValue(null);
    const bindings = new AgentBindings(getAgentSigner);
    bindings.set(ACCOUNT, AGENT);

    bindings.release(
      { ...ACCOUNT, mainAddress: '0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD' },
      AGENT.address.toUpperCase().replace('0X', '0x'),
    );

    expect(await bindings.resolve(ACCOUNT)).toBeNull();
    expect(getAgentSigner.mock.calls).toStrictEqual([[ACCOUNT]]);
  });

  it("releases only the rejecting account's binding to the agent", async () => {
    const getAgentSigner = jest.fn().mockResolvedValue(null);
    const bindings = new AgentBindings(getAgentSigner);
    const testnetAccount: PerpsAgentAccount = { ...ACCOUNT, isTestnet: true };
    bindings.set(ACCOUNT, AGENT);
    bindings.set(testnetAccount, AGENT);

    bindings.release(testnetAccount, AGENT.address);

    expect(await bindings.resolve(ACCOUNT)).toBe(AGENT);
    expect(await bindings.resolve(testnetAccount)).toBeNull();
    expect(getAgentSigner.mock.calls).toStrictEqual([[testnetAccount]]);
  });

  it('keeps a binding to another agent and a pin when an agent is rejected', async () => {
    const getAgentSigner = jest.fn().mockResolvedValue(AGENT);
    const bindings = new AgentBindings(getAgentSigner);
    const otherAccount: PerpsAgentAccount = { ...ACCOUNT, isTestnet: true };
    bindings.set(ACCOUNT, AGENT);
    bindings.set(otherAccount, null);

    bindings.release(ACCOUNT, OTHER_AGENT_ADDRESS);
    bindings.release(otherAccount, AGENT.address);

    expect(await bindings.resolve(ACCOUNT)).toBe(AGENT);
    expect(await bindings.resolve(otherAccount)).toBeNull();
    expect(getAgentSigner).not.toHaveBeenCalled();
  });
});

describe('isAgentSignerUnavailableError', () => {
  it('finds the error anywhere in the cause chain', () => {
    const unavailable = new AgentSignerUnavailableError(new Error('down'));

    expect(isAgentSignerUnavailableError(sdkSigningError(unavailable))).toBe(
      true,
    );
    expect(isAgentSignerUnavailableError(new Error('other'))).toBe(false);
  });
});
