import {
  CEREMONY_MAX_AGE_MS,
  CeremonyManager,
  MAX_CONCURRENT_PASSKEY_CEREMONIES,
} from './ceremony-manager';

describe('CeremonyManager', () => {
  const baseReg = { userHandle: 'u' };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('registration flow', () => {
    it('save stores ceremony state retrievable by challenge', () => {
      const manager = new CeremonyManager();
      const now = 1_000_000;
      jest.setSystemTime(now);
      manager.saveRegistrationCeremony('chal1', {
        ...baseReg,
        challenge: 'chal1',
        createdAt: now,
      });
      expect(manager.getRegistrationCeremony('chal1')).toMatchObject({
        challenge: 'chal1',
        createdAt: now,
      });
    });

    it('getRegistrationCeremony prunes entries older than CEREMONY_MAX_AGE_MS before lookup', () => {
      const manager = new CeremonyManager();
      const tOld = 100_000;
      const tNew = 150_000;
      const pruneAt = tOld + CEREMONY_MAX_AGE_MS + 1;
      jest.setSystemTime(tOld);
      manager.saveRegistrationCeremony('old', {
        ...baseReg,
        challenge: 'old',
        createdAt: tOld,
      });
      jest.setSystemTime(tNew);
      manager.saveRegistrationCeremony('new', {
        ...baseReg,
        challenge: 'new',
        createdAt: tNew,
      });
      jest.setSystemTime(pruneAt);
      expect(pruneAt - tOld).toBeGreaterThan(CEREMONY_MAX_AGE_MS);
      expect(manager.getRegistrationCeremony('new')).toMatchObject({
        challenge: 'new',
        createdAt: tNew,
      });
      expect(manager.getRegistrationCeremony('old')).toBeUndefined();
    });

    it('evicts oldest createdAt when at capacity', () => {
      const manager = new CeremonyManager();
      const cap = MAX_CONCURRENT_PASSKEY_CEREMONIES;
      for (let i = 0; i <= cap; i += 1) {
        const createdAt = 10 + i;
        jest.setSystemTime(createdAt);
        manager.saveRegistrationCeremony(`k${i}`, {
          ...baseReg,
          challenge: `k${i}`,
          createdAt,
        });
      }
      expect(manager.getRegistrationCeremony('k0')).toBeUndefined();
      expect(manager.getRegistrationCeremony('k1')).toMatchObject({
        challenge: 'k1',
        createdAt: 11,
      });
    });

    it('still saves when at capacity and all existing ceremonies have NaN createdAt', () => {
      const manager = new CeremonyManager();
      const cap = MAX_CONCURRENT_PASSKEY_CEREMONIES;
      for (let i = 0; i < cap; i += 1) {
        jest.setSystemTime(1000 + i);
        manager.saveRegistrationCeremony(`k${i}`, {
          ...baseReg,
          challenge: `k${i}`,
          createdAt: Number.NaN,
        });
      }
      jest.setSystemTime(5000);
      manager.saveRegistrationCeremony('newest', {
        ...baseReg,
        challenge: 'newest',
        createdAt: 5000,
      });
      expect(manager.getRegistrationCeremony('newest')).toMatchObject({
        challenge: 'newest',
        createdAt: 5000,
      });
    });

    it('delete removes a single entry', () => {
      const manager = new CeremonyManager();
      jest.setSystemTime(0);
      manager.saveRegistrationCeremony('x', {
        ...baseReg,
        challenge: 'x',
        createdAt: 0,
      });
      expect(manager.deleteRegistrationCeremony('x')).toBe(true);
      expect(manager.getRegistrationCeremony('x')).toBeUndefined();
      expect(manager.deleteRegistrationCeremony('missing')).toBe(false);
    });

    it('clear removes registration entries', () => {
      const manager = new CeremonyManager();
      jest.setSystemTime(0);
      manager.saveRegistrationCeremony('a', {
        ...baseReg,
        challenge: 'a',
        createdAt: 0,
      });
      manager.saveRegistrationCeremony('b', {
        ...baseReg,
        challenge: 'b',
        createdAt: 0,
      });
      manager.clear();
      expect(manager.getRegistrationCeremony('a')).toBeUndefined();
      expect(manager.getRegistrationCeremony('b')).toBeUndefined();
    });
  });

  it('registration and authentication maps are independent', () => {
    const manager = new CeremonyManager();
    const now = 1_000_000;
    jest.setSystemTime(now);

    manager.saveRegistrationCeremony('reg-chal', {
      userHandle: 'uh',
      challenge: 'reg-chal',
      createdAt: now,
    });
    manager.saveAuthenticationCeremony('auth-chal', {
      challenge: 'auth-chal',
      createdAt: now,
    });

    expect(manager.getRegistrationCeremony('reg-chal')).toBeDefined();
    expect(manager.getAuthenticationCeremony('auth-chal')).toBeDefined();

    jest.setSystemTime(now + CEREMONY_MAX_AGE_MS + 1);
    expect(manager.getRegistrationCeremony('reg-chal')).toBeUndefined();

    jest.setSystemTime(now);
    manager.saveRegistrationCeremony('reg2', {
      userHandle: 'uh2',
      challenge: 'reg2',
      createdAt: now,
    });
    jest.setSystemTime(now + CEREMONY_MAX_AGE_MS + 1);
    expect(manager.getAuthenticationCeremony('auth-chal')).toBeUndefined();

    jest.setSystemTime(now);
    manager.saveAuthenticationCeremony('auth2', {
      challenge: 'auth2',
      createdAt: now,
    });
    expect(manager.deleteRegistrationCeremony('reg2')).toBe(true);
    expect(manager.deleteAuthenticationCeremony('auth2')).toBe(true);

    manager.clear();
    expect(manager.getRegistrationCeremony('reg2')).toBeUndefined();
    expect(manager.getAuthenticationCeremony('auth2')).toBeUndefined();
  });
});
