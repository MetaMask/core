import {
  base64ToBytes,
  bytesToBase64,
  stringToBytes,
  bytesToString,
} from '@metamask/utils';

import {
  SeedlessOnboardingControllerError,
  SecretType,
  SecretMetadataVersion,
} from './constants';
import type { SecretDataType, SecretMetadataOptions } from './types';

type ISecretMetadata<DataType extends SecretDataType = Uint8Array> = {
  data: DataType;
  timestamp: number;
  type: SecretType;
  version: SecretMetadataVersion;
  toBytes: () => Uint8Array;
};

// SecretMetadata type without the data and toBytes methods
// in which the data is base64 encoded for more compacted metadata
type SecretMetadataJson<DataType extends SecretDataType> = Omit<
  ISecretMetadata<DataType>,
  'data' | 'toBytes'
> & {
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
export class SecretMetadata<DataType extends SecretDataType = Uint8Array>
  implements ISecretMetadata<DataType>
{
  readonly #data: DataType;

  readonly #timestamp: number;

  readonly #type: SecretType;

  readonly #version: SecretMetadataVersion;

  /**
   * Create a new SecretMetadata instance.
   *
   * @param data - The secret to add metadata to.
   * @param options - The options for the secret metadata.
   * @param options.timestamp - The timestamp when the secret was created.
   * @param options.type - The type of the secret.
   */
  constructor(data: DataType, options?: Partial<SecretMetadataOptions>) {
    this.#data = data;
    this.#timestamp = options?.timestamp ?? Date.now();
    this.#type = options?.type ?? SecretType.Mnemonic;
    this.#version = options?.version ?? SecretMetadataVersion.V1;
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
  static fromBatch<DataType extends SecretDataType = Uint8Array>(
    data: {
      value: DataType;
      options?: Partial<SecretMetadataOptions>;
    }[],
  ): SecretMetadata<DataType>[] {
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
  static assertIsValidSecretMetadataJson<
    DataType extends SecretDataType = Uint8Array,
  >(value: unknown): asserts value is SecretMetadataJson<DataType> {
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
   * @param filterType - The type of the secret to filter.
   * @returns The array of SecretMetadata instances.
   */
  static parseSecretsFromMetadataStore<
    DataType extends SecretDataType = Uint8Array,
  >(
    secretMetadataArr: Uint8Array[],
    filterType?: SecretType,
  ): SecretMetadata<DataType>[] {
    const parsedSecertMetadata = secretMetadataArr.map((metadata) =>
      SecretMetadata.fromRawMetadata<DataType>(metadata),
    );

    const secrets = SecretMetadata.sort(parsedSecertMetadata);

    if (filterType) {
      return secrets.filter((secret) => secret.type === filterType);
    }

    return secrets;
  }

  /**
   * Parse and create the SecretMetadata instance from the raw metadata bytes.
   *
   * @param rawMetadata - The raw metadata.
   * @returns The parsed secret metadata.
   */
  static fromRawMetadata<DataType extends SecretDataType>(
    rawMetadata: Uint8Array,
  ): SecretMetadata<DataType> {
    const serializedMetadata = bytesToString(rawMetadata);
    const parsedMetadata = JSON.parse(serializedMetadata);

    SecretMetadata.assertIsValidSecretMetadataJson<DataType>(parsedMetadata);

    // if the type is not provided, we default to Mnemonic for the backwards compatibility
    const type = parsedMetadata.type ?? SecretType.Mnemonic;
    const version = parsedMetadata.version ?? SecretMetadataVersion.V1;

    let data: DataType;
    try {
      data = base64ToBytes(parsedMetadata.data) as DataType;
    } catch {
      data = parsedMetadata.data as DataType;
    }

    return new SecretMetadata<DataType>(data, {
      timestamp: parsedMetadata.timestamp,
      type,
      version,
    });
  }

  /**
   * Sort the seed phrases by timestamp.
   *
   * @param data - The secret metadata array to sort.
   * @param order - The order to sort the seed phrases. Default is `desc`.
   *
   * @returns The sorted secret metadata array.
   */
  static sort<DataType extends SecretDataType = Uint8Array>(
    data: SecretMetadata<DataType>[],
    order: 'asc' | 'desc' = 'asc',
  ): SecretMetadata<DataType>[] {
    return data.sort((a, b) => {
      if (order === 'asc') {
        return a.timestamp - b.timestamp;
      }
      return b.timestamp - a.timestamp;
    });
  }

  get data(): DataType {
    return this.#data;
  }

  get timestamp() {
    return this.#timestamp;
  }

  get type() {
    return this.#type;
  }

  get version() {
    return this.#version;
  }

  /**
   * Serialize the secret metadata and convert it to a Uint8Array.
   *
   * @returns The serialized SecretMetadata value in bytes.
   */
  toBytes(): Uint8Array {
    let _data: unknown = this.#data;
    if (this.#data instanceof Uint8Array) {
      // encode the raw secret to base64 encoded string
      // to create more compacted metadata
      _data = bytesToBase64(this.#data);
    }

    // serialize the metadata to a JSON string
    const serializedMetadata = JSON.stringify({
      data: _data,
      timestamp: this.#timestamp,
      type: this.#type,
      version: this.#version,
    });

    // convert the serialized metadata to bytes(Uint8Array)
    return stringToBytes(serializedMetadata);
  }
}
