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
      'test',
      () => {
        return { name: 'test', version: 1 };
      },
    ].forEach((mockInvalidList) => {
      it('throws an error when config is invalid', async () => {
        await expect(
          // @ts-expect-error testing invalid input
          withPhishingDetector([mockInvalidList], async () => null),
        ).rejects.toThrow('Invalid config');
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
