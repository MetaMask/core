import { MockToprfEncryptorDecryptor } from './toprfEncryptor';
import type { SecretType } from '../../src/constants';

export const TOPRF_BASE_URL = /https:\/\/node-[1-5]\.dev-node\.web3auth\.io/u;

export const MOCK_TOPRF_COMMITMENT_RESPONSE = {
  jsonrpc: '2.0',
  result: {
    signature: 'MOCK_NODE_SIGNATURE',
    data: 'MOCK_NODE_DATA',
    nodePubX: 'MOCK_NODE_PUB_X',
    nodePubY: 'MOCK_NODE_PUB_Y',
    nodeIndex: '1',
  },
  id: 10,
};

export const MOCK_TOPRF_AUTHENTICATION_RESPONSE = {
  jsonrpc: '2.0',
  result: {
    authToken: 'MOCK_AUTH_TOKEN',
    nodeIndex: 1,
    pubKey: 'MOCK_USER_PUB_KEY',
    keyIndex: 0,
    nodePubKey: 'MOCK_NODE_PUB_KEY',
  },
  id: 10,
};

export const MOCK_SECRET_DATA_ADD_RESPONSE = {
  success: true,
  message: 'Updated successfully',
};

export const MOCK_BATCH_SECRET_DATA_ADD_RESPONSE = {
  success: true,
  message: 'Updated successfully',
};

export const MOCK_SECRET_DATA_GET_RESPONSE = {
  success: true,
  data: [],
  ids: [],
};

export const MOCK_ACQUIRE_METADATA_LOCK_RESPONSE = {
  status: 1,
  id: 'MOCK_METADATA_LOCK_ID',
};

export const MOCK_RELEASE_METADATA_LOCK_RESPONSE = {
  status: 1,
};

export const MULTIPLE_MOCK_SECRET_METADATA = [
  {
    data: new Uint8Array(Buffer.from('seedPhrase1', 'utf-8')),
    timestamp: 10,
  },
  {
    data: new Uint8Array(Buffer.from('seedPhrase3', 'utf-8')),
    timestamp: 60,
  },
  {
    data: new Uint8Array(Buffer.from('seedPhrase2', 'utf-8')),
    timestamp: 20,
  },
];

/**
 * Creates a mock secret data get response
 *
 * @param secretDataArr - The data to be returned
 * @param password - The password to be used
 * @returns The mock secret data get response
 */
export function createMockSecretDataGetResponse<
  T extends
    | Uint8Array
    | { data: Uint8Array; timestamp?: number; type?: SecretType },
>(secretDataArr: T[], password: string) {
  const mockToprfEncryptor = new MockToprfEncryptorDecryptor();
  const ids: string[] = [];

  const encryptedSecretData = secretDataArr.map((secretData) => {
    let b64SecretData: string;
    let timestamp = Date.now();
    let type: SecretType | undefined;
    if (secretData instanceof Uint8Array) {
      b64SecretData = Buffer.from(secretData).toString('base64');
    } else {
      b64SecretData = Buffer.from(secretData.data).toString('base64');
      timestamp = secretData.timestamp || Date.now();
      type = secretData.type;
    }

    const metadata = JSON.stringify({
      data: b64SecretData,
      timestamp,
      type,
    });

    return mockToprfEncryptor.encrypt(
      mockToprfEncryptor.deriveEncKey(password),
      new Uint8Array(Buffer.from(metadata, 'utf-8')),
    );
  });

  const jsonData = {
    success: true,
    data: encryptedSecretData,
    ids,
  };

  return jsonData;
}
