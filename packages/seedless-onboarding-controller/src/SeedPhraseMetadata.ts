import {
  base64ToBytes,
  bytesToBase64,
  stringToBytes,
  bytesToString,
} from '@metamask/utils';

import { SeedlessOnboardingControllerError } from './constants';

type ISeedPhraseMetadata = {
  data: Uint8Array;
  timestamp: number;
  toBytes: () => Uint8Array;
};

// SeedPhraseMetadata type without the seedPhrase and toBytes methods
// in which the seedPhrase is base64 encoded for more compacted metadata
type IBase64SeedPhraseMetadata = Omit<
  ISeedPhraseMetadata,
  'data' | 'toBytes'
> & {
  data: string; // base64 encoded string
};

/**
 * SeedPhraseMetadata is a class that adds metadata to the seed phrase.
 *
 * It contains the seed phrase and the timestamp when it was created.
 * It is used to store the seed phrase in the metadata store.
 *
 * @example
 * ```ts
 * const seedPhraseMetadata = new SeedPhraseMetadata(seedPhrase);
 * ```
 */
export class SeedPhraseMetadata implements ISeedPhraseMetadata {
  readonly #data: Uint8Array;

  readonly #timestamp: number;

  /**
   * Create a new SeedPhraseMetadata instance.
   *
   * @param data - The seed phrase data to add metadata to.
   * @param timestamp - The timestamp when the seed phrase was created.
   */
  constructor(data: Uint8Array, timestamp: number = Date.now()) {
    this.#data = data;
    this.#timestamp = timestamp;
  }

  /**
   * Create an Array of SeedPhraseMetadata instances from an array of seed phrases.
   *
   * To respect the order of the seed phrases, we add the index to the timestamp
   * so that the first seed phrase backup will have the oldest timestamp
   * and the last seed phrase backup will have the newest timestamp.
   *
   * @param seedPhrases - The seed phrases to add metadata to.
   * @returns The SeedPhraseMetadata instances.
   */
  static fromBatchSeedPhrases(seedPhrases: Uint8Array[]): SeedPhraseMetadata[] {
    const timestamp = Date.now();
    return seedPhrases.map((seedPhrase, index) => {
      // To respect the order of the seed phrases, we add the index to the timestamp
      // so that the first seed phrase backup will have the oldest timestamp
      // and the last seed phrase backup will have the newest timestamp
      const backupCreatedAt = timestamp + index * 5;
      return new SeedPhraseMetadata(seedPhrase, backupCreatedAt);
    });
  }

  /**
   * Assert that the provided value is a valid seed phrase metadata.
   *
   * @param value - The value to check.
   * @throws If the value is not a valid seed phrase metadata.
   */
  static assertIsBase64SeedphraseMetadata(
    value: unknown,
  ): asserts value is IBase64SeedPhraseMetadata {
    if (
      typeof value !== 'object' ||
      !value ||
      !('data' in value) ||
      typeof value.data !== 'string' ||
      !('timestamp' in value) ||
      typeof value.timestamp !== 'number'
    ) {
      throw new Error(
        SeedlessOnboardingControllerError.InvalidSeedPhraseMetadata,
      );
    }
  }

  /**
   * Parse the seed phrase metadata from the metadata store and return the array of raw seed phrases.
   *
   * This method also sorts the seed phrases by timestamp in descending order, i.e. the newest seed phrase will be the first element in the array.
   *
   * @param seedPhraseMetadataArr - The array of SeedPhrase Metadata from the metadata store.
   * @returns The array of raw seed phrases.
   */
  static parseSeedPhraseFromMetadataStore(
    seedPhraseMetadataArr: Uint8Array[],
  ): Uint8Array[] {
    const parsedSeedPhraseMetadata = seedPhraseMetadataArr.map((metadata) =>
      SeedPhraseMetadata.fromRawMetadata(metadata),
    );

    const seedPhrases = SeedPhraseMetadata.sort(parsedSeedPhraseMetadata);

    return seedPhrases.map((seedPhraseMetadata) => seedPhraseMetadata.data);
  }

  /**
   * Parse and create the SeedPhraseMetadata instance from the raw metadata.
   *
   * @param rawMetadata - The raw metadata.
   * @returns The parsed seed phrase metadata.
   */
  static fromRawMetadata(rawMetadata: Uint8Array): SeedPhraseMetadata {
    const serializedMetadata = bytesToString(rawMetadata);
    const parsedMetadata = JSON.parse(serializedMetadata);

    SeedPhraseMetadata.assertIsBase64SeedphraseMetadata(parsedMetadata);

    const seedPhraseBytes = base64ToBytes(parsedMetadata.data);
    return new SeedPhraseMetadata(seedPhraseBytes, parsedMetadata.timestamp);
  }

  /**
   * Sort the seed phrases by timestamp.
   *
   * @param seedPhrases - The seed phrases to sort.
   * @param order - The order to sort the seed phrases. Default is `desc`.
   *
   * @returns The sorted seed phrases.
   */
  static sort(
    seedPhrases: SeedPhraseMetadata[],
    order: 'asc' | 'desc' = 'desc',
  ): SeedPhraseMetadata[] {
    return seedPhrases.sort((a, b) => {
      if (order === 'asc') {
        return a.timestamp - b.timestamp;
      }
      return b.timestamp - a.timestamp;
    });
  }

  get data() {
    return this.#data;
  }

  get timestamp() {
    return this.#timestamp;
  }

  /**
   * Serialize the seed phrase metadata and convert it to a Uint8Array.
   *
   * @returns The serialized SeedPhraseMetadata value in bytes.
   */
  toBytes(): Uint8Array {
    // encode the raw SeedPhrase to base64 encoded string
    // to create more compacted metadata
    const b64SeedPhrase = bytesToBase64(this.#data);

    // serialize the metadata to a JSON string
    const serializedMetadata = JSON.stringify({
      data: b64SeedPhrase,
      timestamp: this.#timestamp,
    });

    // convert the serialized metadata to bytes(Uint8Array)
    return stringToBytes(serializedMetadata);
  }
}
