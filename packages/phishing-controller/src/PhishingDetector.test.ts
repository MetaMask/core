import {
  PhishingDetector,
  type PhishingDetectorOptions,
} from './PhishingDetector';
import { formatHostnameToUrl } from './tests/utils';

describe('PhishingDetector', () => {
  describe('constructor', () => {
    describe('with a recommended config', () => {
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

    describe('with legacy config', () => {
      it('constructs a phishing detector when whitelist is missing', async () => {
        await withPhishingDetector(
          {
            blacklist: [],
            fuzzylist: [],
            tolerance: 2,
          },
          ({ detector }) => {
            expect(detector).toBeDefined();
          },
        );
      });

      it('constructs a phishing detector when blacklist is missing', async () => {
        await withPhishingDetector(
          {
            fuzzylist: [],
            tolerance: 2,
            whitelist: [],
          },
          ({ detector }) => {
            expect(detector).toBeDefined();
          },
        );
      });

      it('constructs a phishing detector when fuzzylist and tolerance are missing', async () => {
        await withPhishingDetector(
          {
            whitelist: [],
            blacklist: [],
          },
          ({ detector }) => {
            expect(detector).toBeDefined();
          },
        );
      });

      it('constructs a phishing detector when tolerance is missing', async () => {
        await withPhishingDetector(
          {
            blacklist: [],
            fuzzylist: [],
            whitelist: [],
          },
          ({ detector }) => {
            expect(detector).toBeDefined();
          },
        );
      });
    });
  });

  describe('check', () => {
    describe('with recommended config', () => {
      it('allows a domain when no config is provided', async () => {
        await withPhishingDetector([], async ({ detector }) => {
          const { result, type } = detector.check(
            formatHostnameToUrl('default.com'),
          );

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
            const { result, type } = detector.check(
              formatHostnameToUrl('default.com'),
            );

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
            const { result, type, name } = detector.check(
              formatHostnameToUrl('blocked-by-first.com'),
            );

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
              formatHostnameToUrl('blocked-by-second.com'),
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
            const { result, type, name } = detector.check(
              formatHostnameToUrl('blocked-by-both.com'),
            );

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
            const { result, type, name } = detector.check(
              formatHostnameToUrl('fuzzy-first.com'),
            );

            expect(result).toBe(true);
            expect(type).toBe('fuzzy');
            expect(name).toBe('first');
          },
        );
      });

      it('blocks a domain that is similar enough (within a tolerance) to a domain in the fuzzylist of the first config', async () => {
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
            const { result, type, name } = detector.check(
              formatHostnameToUrl('fuzzy-firstab.com'),
            );

            expect(result).toBe(true);
            expect(type).toBe('fuzzy');
            expect(name).toBe('first');
          },
        );
      });

      it('allows a domain that is not similar enough to a domain in the fuzzylist of the first config', async () => {
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
            const { result, type } = detector.check(
              formatHostnameToUrl('fuzzy-firstabc.com'),
            );

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
            const { result, type, name } = detector.check(
              formatHostnameToUrl('fuzzy-second.com'),
            );

            expect(result).toBe(true);
            expect(type).toBe('fuzzy');
            expect(name).toBe('second');
          },
        );
      });

      it('blocks a domain that is similar enough (within a tolerance) to a domain in the fuzzylist of the second config', async () => {
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
            const { result, type, name } = detector.check(
              formatHostnameToUrl('fuzzy-secondab.com'),
            );

            expect(result).toBe(true);
            expect(type).toBe('fuzzy');
            expect(name).toBe('second');
          },
        );
      });

      it('allows a domain that is not similar enough to a domain in the fuzzylist of the second config', async () => {
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
            const { result, type } = detector.check(
              formatHostnameToUrl('fuzzy-secondabc.com'),
            );

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
            const { result, type, name } = detector.check(
              formatHostnameToUrl('fuzzy-both.com'),
            );

            expect(result).toBe(true);
            expect(type).toBe('fuzzy');
            expect(name).toBe('first');
          },
        );
      });

      it('blocks a domain when it is in the first blocklist, even if it is also matched by the second fuzzylist', async () => {
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
            const { result, type, name } = detector.check(
              formatHostnameToUrl('blocked-by-first.com'),
            );

            expect(result).toBe(true);
            expect(type).toBe('blocklist');
            expect(name).toBe('first');
          },
        );
      });

      it('blocks a domain when it is matched by the first fuzzylist, even if it is also in the second blocklist', async () => {
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
            const { result, type, name } = detector.check(
              formatHostnameToUrl('fuzzy-first.com'),
            );

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
            const { result, type, name } = detector.check(
              formatHostnameToUrl('allowed-by-first.com'),
            );

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
              formatHostnameToUrl('allowed-by-second.com'),
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
              formatHostnameToUrl('allowed-and-blocked-first.com'),
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
              formatHostnameToUrl('allowed-and-fuzzy-first.com'),
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
              formatHostnameToUrl('allowed-and-blocked-second.com'),
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
              formatHostnameToUrl('allowed-and-fuzzy-second.com'),
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
            const { result, type, name } = detector.check(
              formatHostnameToUrl('allowed-by-both.com'),
            );

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
              formatHostnameToUrl('fuzzy-first-allowed-second.com'),
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
              formatHostnameToUrl('allowed-first-fuzzy-second.com'),
            );

            expect(result).toBe(false);
            expect(type).toBe('allowlist');
            expect(name).toBe('first');
          },
        );
      });

      it('blocks a blocklisted domain when it ends with a dot', async () => {
        await withPhishingDetector(
          [
            {
              allowlist: [],
              blocklist: ['blocked.com'],
              fuzzylist: [],
              name: 'first',
              tolerance: 2,
              version: 1,
            },
          ],
          async ({ detector }) => {
            const { result, type } = detector.check(
              formatHostnameToUrl('blocked.com.'),
            );

            expect(result).toBe(true);
            expect(type).toBe('blocklist');
          },
        );
      });

      it('blocks ipfs cid across various formats (cids located in subdomains and paths)', async () => {
        // CID should not blocked
        await withPhishingDetector(
          [
            {
              allowlist: [],
              blocklist: [
                'QmUDBVyGwqKdSayk7kDKUaj9J41Ft1DWizcKUx5UmgMgGy',
                'bafybeifx7yeb55armcsxwwitkymga5xf53dxiarykms3ygqic223w5sk3m',
                'example.com',
              ],
              fuzzylist: [],
              name: 'first',
              tolerance: 2,
              version: 1,
            },
          ],
          async ({ detector }) => {
            const { result, type } = detector.check(
              formatHostnameToUrl(
                'cf-ipfs.com/ipfs/bafybeiaysi4s6lnjev27ln5icwm6tueaw2vdykrtjkwiphwekaywqhcjze',
              ),
            );

            expect(result).toBe(false);
            expect(type).toBe('all');
          },
        );

        // Gateways differ on where the CID is... sometimes in the path, sometimes in a magic subdomain
        const expectedToBeBlocked = [
          'ipfs.io/ipfs/bafybeifx7yeb55armcsxwwitkymga5xf53dxiarykms3ygqic223w5sk3m#x-ipfs-companion-no-redirect',
          'gateway.pinata.cloud/ipfs/bafybeifx7yeb55armcsxwwitkymga5xf53dxiarykms3ygqic223w5sk3m#x-ipfs-companion-no-redirect',
          'cloudflare-ipfs.com/ipfs/bafybeifx7yeb55armcsxwwitkymga5xf53dxiarykms3ygqic223w5sk3m#x-ipfs-companion-no-redirect',
          'ipfs.eth.aragon.network/ipfs/bafybeifx7yeb55armcsxwwitkymga5xf53dxiarykms3ygqic223w5sk3m#x-ipfs-companion-no-redirect',
          'bafybeifx7yeb55armcsxwwitkymga5xf53dxiarykms3ygqic223w5sk3m.ipfs.dweb.link/#x-ipfs-companion-no-redirect',
          'bafybeifx7yeb55armcsxwwitkymga5xf53dxiarykms3ygqic223w5sk3m.ipfs.cf-ipfs.com/#x-ipfs-companion-no-redirect',
          'example.com',
          'example.com/foo/bar',
        ];

        // CID should be blocked
        for await (const entry of expectedToBeBlocked) {
          await withPhishingDetector(
            [
              {
                allowlist: [],
                blocklist: [
                  'QmUDBVyGwqKdSayk7kDKUaj9J41Ft1DWizcKUx5UmgMgGy',
                  'bafybeifx7yeb55armcsxwwitkymga5xf53dxiarykms3ygqic223w5sk3m',
                  'example.com',
                ],
                fuzzylist: [],
                name: 'first',
                tolerance: 2,
                version: 1,
              },
            ],
            async ({ detector }) => {
              const { result, type } = detector.check(
                formatHostnameToUrl(entry),
              );

              expect(result).toBe(true);
              expect(type).toBe('blocklist');
            },
          );
        }
      });

      it('returns a result without a version when a config lacks a version and the blocklist contains an ipfs cid', async () => {
        await withPhishingDetector(
          [
            {
              allowlist: [],
              blocklist: [
                'bafybeifx7yeb55armcsxwwitkymga5xf53dxiarykms3ygqic223w5sk3m',
              ],
              fuzzylist: [],
              name: 'first',
              tolerance: 2,
            },
          ],
          async ({ detector }) => {
            const { result, version } = detector.check(
              formatHostnameToUrl(
                'ipfs.io/ipfs/bafybeifx7yeb55armcsxwwitkymga5xf53dxiarykms3ygqic223w5sk3m#x-ipfs-companion-no-redirect',
              ),
            );

            expect(result).toBe(true);
            expect(version).toBeUndefined();
          },
        );
      });
    });

    describe('with legacy config', () => {
      it('changes the type to whitelist when the result is allowlist', async () => {
        await withPhishingDetector(
          {
            blacklist: [],
            fuzzylist: [],
            tolerance: 2,
            whitelist: ['allowed.com'],
          },
          async ({ detector }) => {
            const { type, result } = detector.check(
              formatHostnameToUrl('allowed.com'),
            );

            expect(type).toBe('whitelist');
            expect(result).toBe(false);
          },
        );
      });

      it('changes the type to blacklist when the result is blocklist', async () => {
        await withPhishingDetector(
          {
            blacklist: ['blocked.com'],
            fuzzylist: [],
            tolerance: 2,
            whitelist: [],
          },
          async ({ detector }) => {
            const { type, result } = detector.check(
              formatHostnameToUrl('blocked.com'),
            );

            expect(type).toBe('blacklist');
            expect(result).toBe(true);
          },
        );
      });

      it('uses the type `fuzzy` when the result is in fuzzylist', async () => {
        await withPhishingDetector(
          {
            blacklist: [],
            fuzzylist: ['fuzzy.com'],
            tolerance: 2,
            whitelist: [],
          },
          async ({ detector }) => {
            const { type, result } = detector.check(
              formatHostnameToUrl('fupzy.com'),
            );

            expect(type).toBe('fuzzy');
            expect(result).toBe(true);
          },
        );
      });
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
