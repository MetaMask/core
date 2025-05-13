import {
  base64ToBytes,
  bytesToBase64,
  stringToBytes,
  bytesToString,
} from '@metamask/utils';

import { SeedlessOnboardingControllerError, SecretType } from './constants';
import type { SecretMetadataOptions } from './types';

type ISecretMetadata = {
  data: Uint8Array;
  timestamp: number;
  toBytes: () => Uint8Array;
};

// SecretMetadata type without the data and toBytes methods
// in which the data is base64 encoded for more compacted metadata
type IBase64SecretMetadata = Omit<ISecretMetadata, 'data' | 'toBytes'> & {
  data: string; // base64 encoded string
};

/**
 * SecretMetadata is a class that adds metadata to the secret.
 *
 * It contains the secret and the timestamp when it was created.
 * It is used to store the secret in the metadata store.
 *
 * @example
 * ```ts
 * const secretMetadata = new SecretMetadata(secret);
 * ```
 */
export class SecretMetadata implements ISecretMetadata {
  readonly #secret: Uint8Array;

  readonly #timestamp: number;

  readonly #type: SecretType;

  /**
   * Create a new SecretMetadata instance.
   *
   * @param secret - The secret to add metadata to.
   * @param options - The options for the secret metadata.
   * @param options.timestamp - The timestamp when the secret was created.
   * @param options.type - The type of the secret.
   */
  constructor(secret: Uint8Array, options?: Partial<SecretMetadataOptions>) {
    this.#secret = secret;
    this.#timestamp = options?.timestamp ?? Date.now();
    this.#type = options?.type ?? SecretType.Mnemonic;
  }

  /**
   * Create an Array of SecretMetadata instances from an array of secrets.
   *
   * To respect the order of the secrets, we add the index to the timestamp
   * so that the first secret backup will have the oldest timestamp
   * and the last secret backup will have the newest timestamp.
   *
   * @param data - The data to add metadata to.
   * @param data.value - The SeedPhrase/PrivateKey to add metadata to.
   * @param data.options - The options for the seed phrase metadata.
   * @returns The SecretMetadata instances.
   */
  static fromBatch(
    data: {
      value: Uint8Array;
      options?: Partial<SecretMetadataOptions>;
    }[],
  ): SecretMetadata[] {
    const timestamp = Date.now();
    return data.map((d, index) => {
      // To respect the order of the seed phrases, we add the index to the timestamp
      // so that the first seed phrase backup will have the oldest timestamp
      // and the last seed phrase backup will have the newest timestamp
      const backupCreatedAt = d.options?.timestamp ?? timestamp + index * 5;
      return new SecretMetadata(d.value, {
        timestamp: backupCreatedAt,
        type: d.options?.type,
      });
    });
  }

  /**
   * Assert that the provided value is a valid seed phrase metadata.
   *
   * @param value - The value to check.
   * @throws If the value is not a valid seed phrase metadata.
   */
  static assertIsBase64SecretMetadata(
    value: unknown,
  ): asserts value is IBase64SecretMetadata {
    if (
      typeof value !== 'object' ||
      !value ||
      !('data' in value) ||
      typeof value.data !== 'string' ||
      !('timestamp' in value) ||
      typeof value.timestamp !== 'number'
    ) {
      throw new Error(SeedlessOnboardingControllerError.InvalidSecretMetadata);
    }
  }

  /**
   * Parse the SecretMetadata from the metadata store and return the array of SecretMetadata instances.
   *
   * This method also sorts the secrets by timestamp in ascending order, i.e. the oldest secret will be the first element in the array.
   *
   * @param secretMetadataArr - The array of SecretMetadata from the metadata store.
   * @returns The array of SecretMetadata instances.
   */
  static parseSecretsFromMetadataStore(
    secretMetadataArr: Uint8Array[],
  ): SecretMetadata[] {
    const parsedSecertMetadata = secretMetadataArr.map((metadata) =>
      SecretMetadata.fromRawMetadata(metadata),
    );

    const secrets = SecretMetadata.sort(parsedSecertMetadata);

    return secrets;
  }

  /**
   * Parse and create the SecretMetadata instance from the raw metadata.
   *
   * @param rawMetadata - The raw metadata.
   * @param type - The type of the secret.
   * @returns The parsed secret metadata.
   */
  static fromRawMetadata(
    rawMetadata: Uint8Array,
    type: SecretType = SecretType.Mnemonic,
  ): SecretMetadata {
    const serializedMetadata = bytesToString(rawMetadata);
    const parsedMetadata = JSON.parse(serializedMetadata);

    SecretMetadata.assertIsBase64SecretMetadata(parsedMetadata);

    const bytes = base64ToBytes(parsedMetadata.data);
    return new SecretMetadata(bytes, {
      timestamp: parsedMetadata.timestamp,
      type,
    });
  }

  /**
   * Sort the seed phrases by timestamp.
   *
   * @param secrets - The seed phrases to sort.
   * @param order - The order to sort the seed phrases. Default is `desc`.
   *
   * @returns The sorted seed phrases.
   */
  static sort(
    secrets: SecretMetadata[],
    order: 'asc' | 'desc' = 'asc',
  ): SecretMetadata[] {
    return secrets.sort((a, b) => {
      if (order === 'asc') {
        return a.timestamp - b.timestamp;
      }
      return b.timestamp - a.timestamp;
    });
  }

  get data() {
    return this.#secret;
  }

  get timestamp() {
    return this.#timestamp;
  }

  get type() {
    return this.#type;
  }

  /**
   * Serialize the secret metadata and convert it to a Uint8Array.
   *
   * @returns The serialized SecretMetadata value in bytes.
   */
  toBytes(): Uint8Array {
    // encode the raw secret to base64 encoded string
    // to create more compacted metadata
    const b64Data = bytesToBase64(this.#secret);

    // serialize the metadata to a JSON string
    const serializedMetadata = JSON.stringify({
      data: b64Data,
      timestamp: this.#timestamp,
      type: this.#type,
    });

    // convert the serialized metadata to bytes(Uint8Array)
    return stringToBytes(serializedMetadata);
  }
}
