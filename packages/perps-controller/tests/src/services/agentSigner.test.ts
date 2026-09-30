import {
  AgentBindings,
  AgentSignerUnavailableError,
  isAgentSignerUnavailableError,
} from '../../../src/services/agentSigner.js';
import type { PerpsAgentAccount } from '../../../src/types/index.js';
import {
  AGENT_ADDRESS,
  MAINNET_ACCOUNT,
  OTHER_AGENT_ADDRESS,
  OTHER_MAIN_ADDRESS,
  sdkSigningError,
  TESTNET_ACCOUNT,
} from '../../helpers/agentFixtures.js';

// The same main account, spelled in upper case.
const UPPER_CASE_MAIN_ADDRESS = `0x${MAINNET_ACCOUNT.mainAddress
  .slice(2)
  .toUpperCase()}` as const;
const AGENT = {
  address: AGENT_ADDRESS,
  signTypedData: jest.fn(),
} as const;

describe('AgentBindings', () => {
  it('resolves no agent without getAgentSigner or a binding', async () => {
    const bindings = new AgentBindings(undefined);

    expect(await bindings.resolve(MAINNET_ACCOUNT)).toBeNull();
  });

  it('answers with a binding for its account and network only, and asks getAgentSigner for the others', async () => {
    const getAgentSigner = jest.fn().mockResolvedValue(null);
    const bindings = new AgentBindings(getAgentSigner);
    const otherAccount: PerpsAgentAccount = {
      ...MAINNET_ACCOUNT,
      mainAddress: OTHER_MAIN_ADDRESS,
    };

    bindings.set(MAINNET_ACCOUNT, AGENT);

    expect(await bindings.resolve(MAINNET_ACCOUNT)).toBe(AGENT);
    expect(await bindings.resolve(otherAccount)).toBeNull();
    expect(await bindings.resolve(TESTNET_ACCOUNT)).toBeNull();
    expect(getAgentSigner.mock.calls).toStrictEqual([
      [otherAccount],
      [TESTNET_ACCOUNT],
    ]);
  });

  it('matches a binding whatever the main address casing', async () => {
    const getAgentSigner = jest.fn().mockResolvedValue(null);
    const bindings = new AgentBindings(getAgentSigner);

    bindings.set(MAINNET_ACCOUNT, AGENT);

    expect(
      await bindings.resolve({
        ...MAINNET_ACCOUNT,
        mainAddress: UPPER_CASE_MAIN_ADDRESS,
      }),
    ).toBe(AGENT);
    expect(getAgentSigner).not.toHaveBeenCalled();
  });

  it('forgets bindings and pins once cleared', async () => {
    const getAgentSigner = jest.fn().mockResolvedValue(null);
    const bindings = new AgentBindings(getAgentSigner);
    const otherAccount: PerpsAgentAccount = {
      ...MAINNET_ACCOUNT,
      mainAddress: OTHER_MAIN_ADDRESS,
    };
    bindings.set(MAINNET_ACCOUNT, null);
    bindings.set(otherAccount, AGENT);

    bindings.clear();

    expect(await bindings.resolve(MAINNET_ACCOUNT)).toBeNull();
    expect(await bindings.resolve(otherAccount)).toBeNull();
    // Both now fall through to the host.
    expect(getAgentSigner.mock.calls).toStrictEqual([
      [MAINNET_ACCOUNT],
      [otherAccount],
    ]);
  });

  it('releases a binding to the rejected agent whatever the address casing', async () => {
    const getAgentSigner = jest.fn().mockResolvedValue(null);
    const bindings = new AgentBindings(getAgentSigner);
    bindings.set(MAINNET_ACCOUNT, AGENT);

    bindings.release(
      { ...MAINNET_ACCOUNT, mainAddress: UPPER_CASE_MAIN_ADDRESS },
      AGENT.address.toUpperCase().replace('0X', '0x'),
    );

    expect(await bindings.resolve(MAINNET_ACCOUNT)).toBeNull();
    expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
  });

  it("releases only the rejecting account's binding to the agent", async () => {
    const getAgentSigner = jest.fn().mockResolvedValue(null);
    const bindings = new AgentBindings(getAgentSigner);
    bindings.set(MAINNET_ACCOUNT, AGENT);
    bindings.set(TESTNET_ACCOUNT, AGENT);

    bindings.release(TESTNET_ACCOUNT, AGENT.address);

    expect(await bindings.resolve(MAINNET_ACCOUNT)).toBe(AGENT);
    expect(await bindings.resolve(TESTNET_ACCOUNT)).toBeNull();
    expect(getAgentSigner.mock.calls).toStrictEqual([[TESTNET_ACCOUNT]]);
  });

  it('keeps a binding to another agent and a pin when an agent is rejected', async () => {
    const getAgentSigner = jest.fn().mockResolvedValue(AGENT);
    const bindings = new AgentBindings(getAgentSigner);
    bindings.set(MAINNET_ACCOUNT, AGENT);
    bindings.set(TESTNET_ACCOUNT, null);

    bindings.release(MAINNET_ACCOUNT, OTHER_AGENT_ADDRESS);
    bindings.release(TESTNET_ACCOUNT, AGENT.address);

    expect(await bindings.resolve(MAINNET_ACCOUNT)).toBe(AGENT);
    expect(await bindings.resolve(TESTNET_ACCOUNT)).toBeNull();
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
