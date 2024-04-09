import {
  PhishingDetector,
  type PhishingDetectorOptions,
} from './PhishingDetector';

describe('PhishingDetector', () => {
  describe('constructor', () => {
    it('constructs a phishing detector when allowlist is missing', async () => {
      await withPhishingDetector(
        [
          {
            blocklist: [],
            fuzzylist: [],
            name: 'first',
            tolerance: 2,
            version: 1,
          },
        ],
        ({ detector }) => {
          expect(detector).toBeDefined();
        },
      );
    });

    it('constructs a phishing detector when blocklist is missing', async () => {
      await withPhishingDetector(
        [
          {
            allowlist: [],
            fuzzylist: [],
            name: 'first',
            tolerance: 2,
            version: 1,
          },
        ],
        ({ detector }) => {
          expect(detector).toBeDefined();
        },
      );
    });

    it('constructs a phishing detector when fuzzylist and tolerance are missing', async () => {
      await withPhishingDetector(
        [
          {
            allowlist: [],
            blocklist: [],
            name: 'first',
            version: 1,
          },
        ],
        ({ detector }) => {
          expect(detector).toBeDefined();
        },
      );
    });

    it('constructs a phishing detector when tolerance is missing', async () => {
      await withPhishingDetector(
        [
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: [],
            name: 'first',
            version: 1,
          },
        ],
        ({ detector }) => {
          expect(detector).toBeDefined();
        },
      );
    });

    [
      undefined,
      null,
      true,
      false,
      0,
      1,
      1.1,
      '',
      () => {
        return { name: 'test', version: 1 };
      },
      {},
    ].forEach((mockInvalidName) => {
      it('throws an error when config name is invalid', async () => {
        await expect(
          withPhishingDetector(
            [
              {
                allowlist: [],
                blocklist: ['blocked-by-first.com'],
                fuzzylist: [],
                // @ts-expect-error testing invalid input
                name: mockInvalidName,
                tolerance: 2,
                version: 1,
              },
            ],
            async () => mockInvalidName,
          ),
        ).rejects.toThrow("Invalid config parameter: 'name'");
      });
    });

    it('throws an error when tolerance is provided without fuzzylist', async () => {
      await expect(
        withPhishingDetector(
          [
            // @ts-expect-error testing invalid input
            {
              allowlist: [],
              blocklist: [],
              name: 'first',
              tolerance: 2,
              version: 1,
            },
          ],
          async () => null,
        ),
      ).rejects.toThrow('Fuzzylist tolerance provided without fuzzylist');
    });

    [
      undefined,
      null,
      true,
      false,
      '',
      () => {
        return { name: 'test', version: 1 };
      },
      {},
    ].forEach((mockInvalidVersion) => {
      it('throws an error when config version is invalid', async () => {
        await expect(
          withPhishingDetector(
            [
              {
                allowlist: [],
                blocklist: ['blocked-by-first.com'],
                fuzzylist: [],
                name: 'first',
                tolerance: 2,
                // @ts-expect-error testing invalid input
                version: mockInvalidVersion,
              },
            ],
            async () => null,
          ),
        ).rejects.toThrow("Invalid config parameter: 'version'");
      });
    });
  });

  describe('check', () => {
    it('allows a domain when no config is provided', async () => {
      await withPhishingDetector([], async ({ detector }) => {
        const { result, type } = detector.check('default.com');

        expect(result).toBe(false);
        expect(type).toBe('all');
      });
    });

    it('allows a domain when empty lists are provided', async () => {
      await withPhishingDetector(
        [
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: [],
            name: 'first',
            tolerance: 2,
            version: 1,
          },
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: [],
            name: 'second',
            tolerance: 2,
            version: 1,
          },
        ],
        async ({ detector }) => {
          const { result, type } = detector.check('default.com');

          expect(result).toBe(false);
          expect(type).toBe('all');
        },
      );
    });

    it('blocks a domain when it is in the blocklist of the first config', async () => {
      await withPhishingDetector(
        [
          {
            allowlist: [],
            blocklist: ['blocked-by-first.com'],
            fuzzylist: [],
            name: 'first',
            tolerance: 2,
            version: 1,
          },
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: [],
            name: 'second',
            tolerance: 2,
            version: 1,
          },
        ],
        async ({ detector }) => {
          const { result, type, name } = detector.check('blocked-by-first.com');

          expect(result).toBe(true);
          expect(type).toBe('blocklist');
          expect(name).toBe('first');
        },
      );
    });

    it('blocks a domain when it is in the blocklist of the second config', async () => {
      await withPhishingDetector(
        [
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: [],
            name: 'first',
            tolerance: 2,
            version: 1,
          },
          {
            allowlist: [],
            blocklist: ['blocked-by-second.com'],
            fuzzylist: [],
            name: 'second',
            tolerance: 2,
            version: 1,
          },
        ],
        async ({ detector }) => {
          const { result, type, name } = detector.check(
            'blocked-by-second.com',
          );

          expect(result).toBe(true);
          expect(type).toBe('blocklist');
          expect(name).toBe('second');
        },
      );
    });

    it('prefers the first config when a domain is in both blocklists', async () => {
      await withPhishingDetector(
        [
          {
            allowlist: [],
            blocklist: ['blocked-by-both.com'],
            fuzzylist: [],
            name: 'first',
            tolerance: 2,
            version: 1,
          },
          {
            allowlist: [],
            blocklist: ['blocked-by-both.com'],
            fuzzylist: [],
            name: 'second',
            tolerance: 2,
            version: 1,
          },
        ],
        async ({ detector }) => {
          const { result, type, name } = detector.check('blocked-by-both.com');

          expect(result).toBe(true);
          expect(type).toBe('blocklist');
          expect(name).toBe('first');
        },
      );
    });

    it('blocks a domain when it is in the fuzzylist of the first config', async () => {
      await withPhishingDetector(
        [
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: ['fuzzy-first.com'],
            name: 'first',
            tolerance: 2,
            version: 1,
          },
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: [],
            name: 'second',
            tolerance: 2,
            version: 1,
          },
        ],
        async ({ detector }) => {
          const { result, type, name } = detector.check('fuzzy-first.com');

          expect(result).toBe(true);
          expect(type).toBe('fuzzy');
          expect(name).toBe('first');
        },
      );
    });

    it('blocks a "similar enough" domain when it is in the fuzzylist of the first config', async () => {
      await withPhishingDetector(
        [
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: ['fuzzy-first.com'],
            name: 'first',
            tolerance: 2,
            version: 1,
          },
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: [],
            name: 'second',
            tolerance: 2,
            version: 1,
          },
        ],
        async ({ detector }) => {
          const { result, type, name } = detector.check('fuzzy-firstab.com');

          expect(result).toBe(true);
          expect(type).toBe('fuzzy');
          expect(name).toBe('first');
        },
      );
    });

    it('allows a domain when it is in the fuzzylist of the first config but not similar enough', async () => {
      await withPhishingDetector(
        [
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: ['fuzzy-first.com'],
            name: 'first',
            tolerance: 2,
            version: 1,
          },
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: [],
            name: 'second',
            tolerance: 2,
            version: 1,
          },
        ],
        async ({ detector }) => {
          const { result, type } = detector.check('fuzzy-firstabc.com');

          expect(result).toBe(false);
          expect(type).toBe('all');
        },
      );
    });

    it('blocks a domain when it is in the fuzzylist of the second config', async () => {
      await withPhishingDetector(
        [
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: [],
            name: 'first',
            tolerance: 2,
            version: 1,
          },
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: ['fuzzy-second.com'],
            name: 'second',
            tolerance: 2,
            version: 1,
          },
        ],
        async ({ detector }) => {
          const { result, type, name } = detector.check('fuzzy-second.com');

          expect(result).toBe(true);
          expect(type).toBe('fuzzy');
          expect(name).toBe('second');
        },
      );
    });

    it('blocks a "similar enough" domain when it is in the fuzzylist of the second config', async () => {
      await withPhishingDetector(
        [
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: [],
            name: 'first',
            tolerance: 2,
            version: 1,
          },
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: ['fuzzy-second.com'],
            name: 'second',
            tolerance: 2,
            version: 1,
          },
        ],
        async ({ detector }) => {
          const { result, type, name } = detector.check('fuzzy-secondab.com');

          expect(result).toBe(true);
          expect(type).toBe('fuzzy');
          expect(name).toBe('second');
        },
      );
    });

    it('allows a domain when it is in the fuzzylist of the second config but not similar enough', async () => {
      await withPhishingDetector(
        [
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: [],
            name: 'first',
            tolerance: 2,
            version: 1,
          },
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: ['fuzzy-second.com'],
            name: 'second',
            tolerance: 2,
            version: 1,
          },
        ],
        async ({ detector }) => {
          const { result, type } = detector.check('fuzzy-secondabc.com');

          expect(result).toBe(false);
          expect(type).toBe('all');
        },
      );
    });

    it('prefers the first config when a domain is in both fuzzylists', async () => {
      await withPhishingDetector(
        [
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: ['fuzzy-both.com'],
            name: 'first',
            tolerance: 2,
            version: 1,
          },
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: ['fuzzy-both.com'],
            name: 'second',
            tolerance: 2,
            version: 1,
          },
        ],
        async ({ detector }) => {
          const { result, type, name } = detector.check('fuzzy-both.com');

          expect(result).toBe(true);
          expect(type).toBe('fuzzy');
          expect(name).toBe('first');
        },
      );
    });

    it('blocks a domain when it is in the first blocklist and the second fuzzylist (from first)', async () => {
      await withPhishingDetector(
        [
          {
            allowlist: [],
            blocklist: ['blocked-by-first.com'],
            fuzzylist: [],
            name: 'first',
            tolerance: 2,
            version: 1,
          },
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: ['fuzzy-second.com'],
            name: 'second',
            tolerance: 2,
            version: 1,
          },
        ],
        async ({ detector }) => {
          const { result, type, name } = detector.check('blocked-by-first.com');

          expect(result).toBe(true);
          expect(type).toBe('blocklist');
          expect(name).toBe('first');
        },
      );
    });

    it('blocks a domain when it is in the first fuzzylist and the second blocklist (from first)', async () => {
      await withPhishingDetector(
        [
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: ['fuzzy-first.com'],
            name: 'first',
            tolerance: 2,
            version: 1,
          },
          {
            allowlist: [],
            blocklist: ['blocked-by-second.com'],
            fuzzylist: [],
            name: 'second',
            tolerance: 2,
            version: 1,
          },
        ],
        async ({ detector }) => {
          const { result, type, name } = detector.check('fuzzy-first.com');

          expect(result).toBe(true);
          expect(type).toBe('fuzzy');
          expect(name).toBe('first');
        },
      );
    });

    it('allows a domain when it is in the first allowlist (and not blocked by the second blocklist)', async () => {
      await withPhishingDetector(
        [
          {
            allowlist: ['allowed-by-first.com'],
            blocklist: [],
            fuzzylist: [],
            name: 'first',
            tolerance: 2,
            version: 1,
          },
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: [],
            name: 'second',
            tolerance: 2,
            version: 1,
          },
        ],
        async ({ detector }) => {
          const { result, type, name } = detector.check('allowed-by-first.com');

          expect(result).toBe(false);
          expect(type).toBe('allowlist');
          expect(name).toBe('first');
        },
      );
    });

    it('allows a domain when it is in the second allowlist (and not blocked by the first blocklist)', async () => {
      await withPhishingDetector(
        [
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: [],
            name: 'first',
            tolerance: 2,
            version: 1,
          },
          {
            allowlist: ['allowed-by-second.com'],
            blocklist: [],
            fuzzylist: [],
            name: 'second',
            tolerance: 2,
            version: 1,
          },
        ],
        async ({ detector }) => {
          const { result, type, name } = detector.check(
            'allowed-by-second.com',
          );

          expect(result).toBe(false);
          expect(type).toBe('allowlist');
          expect(name).toBe('second');
        },
      );
    });

    it('allows a domain when it is in the first allowlist and the first blocklist (and not blocked by the second blocklist)', async () => {
      await withPhishingDetector(
        [
          {
            allowlist: ['allowed-and-blocked-first.com'],
            blocklist: ['allowed-and-blocked-first.com'],
            fuzzylist: [],
            name: 'first',
            tolerance: 2,
            version: 1,
          },
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: [],
            name: 'second',
            tolerance: 2,
            version: 1,
          },
        ],
        async ({ detector }) => {
          const { result, type, name } = detector.check(
            'allowed-and-blocked-first.com',
          );

          expect(result).toBe(false);
          expect(type).toBe('allowlist');
          expect(name).toBe('first');
        },
      );
    });

    it('allows a domain when it is in the first allowlist and the first fuzzylist (and not blocked by the second blocklist)', async () => {
      await withPhishingDetector(
        [
          {
            allowlist: ['allowed-and-fuzzy-first.com'],
            blocklist: [],
            fuzzylist: ['allowed-and-fuzzy-first.com'],
            name: 'first',
            tolerance: 2,
            version: 1,
          },
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: [],
            name: 'second',
            tolerance: 2,
            version: 1,
          },
        ],
        async ({ detector }) => {
          const { result, type, name } = detector.check(
            'allowed-and-fuzzy-first.com',
          );

          expect(result).toBe(false);
          expect(type).toBe('allowlist');
          expect(name).toBe('first');
        },
      );
    });

    it('allows a domain when it is in the second allowlist and the second blocklist (and not blocked by the first blocklist)', async () => {
      await withPhishingDetector(
        [
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: [],
            name: 'first',
            tolerance: 2,
            version: 1,
          },
          {
            allowlist: ['allowed-and-blocked-second.com'],
            blocklist: ['allowed-and-blocked-second.com'],
            fuzzylist: [],
            name: 'second',
            tolerance: 2,
            version: 1,
          },
        ],
        async ({ detector }) => {
          const { result, type, name } = detector.check(
            'allowed-and-blocked-second.com',
          );

          expect(result).toBe(false);
          expect(type).toBe('allowlist');
          expect(name).toBe('second');
        },
      );
    });

    it('allows a domain when it is in the second allowlist and the second fuzzylist (and not blocked by the first blocklist)', async () => {
      await withPhishingDetector(
        [
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: [],
            name: 'first',
            tolerance: 2,
            version: 1,
          },
          {
            allowlist: ['allowed-and-fuzzy-second.com'],
            blocklist: [],
            fuzzylist: ['allowed-and-fuzzy-second.com'],
            name: 'second',
            tolerance: 2,
            version: 1,
          },
        ],
        async ({ detector }) => {
          const { result, type, name } = detector.check(
            'allowed-and-fuzzy-second.com',
          );

          expect(result).toBe(false);
          expect(type).toBe('allowlist');
          expect(name).toBe('second');
        },
      );
    });

    it('allows a domain when it is in the first and second allowlist', async () => {
      await withPhishingDetector(
        [
          {
            allowlist: ['allowed-by-both.com'],
            blocklist: [],
            fuzzylist: [],
            name: 'first',
            tolerance: 2,
            version: 1,
          },
          {
            allowlist: ['allowed-by-both.com'],
            blocklist: [],
            fuzzylist: [],
            name: 'second',
            tolerance: 2,
            version: 1,
          },
        ],
        async ({ detector }) => {
          const { result, type, name } = detector.check('allowed-by-both.com');

          expect(result).toBe(false);
          expect(type).toBe('allowlist');
          expect(name).toBe('first');
        },
      );
    });

    it('allows a domain when it is in the first fuzzylist and the second allowlist', async () => {
      await withPhishingDetector(
        [
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: ['fuzzy-first-allowed-second.com'],
            name: 'first',
            tolerance: 2,
            version: 1,
          },
          {
            allowlist: ['fuzzy-first-allowed-second.com'],
            blocklist: [],
            fuzzylist: [],
            name: 'second',
            tolerance: 2,
            version: 1,
          },
        ],
        async ({ detector }) => {
          const { result, type, name } = detector.check(
            'fuzzy-first-allowed-second.com',
          );

          expect(result).toBe(false);
          expect(type).toBe('allowlist');
          expect(name).toBe('second');
        },
      );
    });

    it('allows a domain when it is in the first allowlist and the second fuzzylist', async () => {
      await withPhishingDetector(
        [
          {
            allowlist: ['allowed-first-fuzzy-second.com'],
            blocklist: [],
            fuzzylist: [],
            name: 'first',
            tolerance: 2,
            version: 1,
          },
          {
            allowlist: [],
            blocklist: [],
            fuzzylist: ['allowed-first-fuzzy-second.com'],
            name: 'second',
            tolerance: 2,
            version: 1,
          },
        ],
        async ({ detector }) => {
          const { result, type, name } = detector.check(
            'allowed-first-fuzzy-second.com',
          );

          expect(result).toBe(false);
          expect(type).toBe('allowlist');
          expect(name).toBe('first');
        },
      );
    });
  });
});

type WithPhishingDetectorCallback<ReturnValue> = ({
  detector,
}: {
  detector: PhishingDetector;
}) => Promise<ReturnValue> | ReturnValue;

type WithPhishingDetectorArgs<ReturnValue> = [
  PhishingDetectorOptions,
  WithPhishingDetectorCallback<ReturnValue>,
];

/**
 * Build a phishing detector and run a callback with it.
 *
 * @param args - The phishing detector options and callback.
 * @returns The return value of the callback.
 */
async function withPhishingDetector<ReturnValue>(
  ...args: WithPhishingDetectorArgs<ReturnValue>
): Promise<ReturnValue> {
  const [options, fn] = args;
  const detector = new PhishingDetector(options);
  return await fn({
    detector,
  });
}
