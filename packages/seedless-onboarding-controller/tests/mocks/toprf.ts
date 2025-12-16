import { EncAccountDataType } from '@metamask/toprf-secure-backup';

import { MockToprfEncryptorDecryptor } from './toprfEncryptor';
import { SecretType } from '../../src/constants';

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
    type: SecretType.Mnemonic,
    itemId: 'srp-1',
    dataType: EncAccountDataType.PrimarySrp,
    createdAt: '00000001-0000-1000-8000-000000000001',
  },
  {
    data: new Uint8Array(Buffer.from('seedPhrase3', 'utf-8')),
    timestamp: 60,
    type: SecretType.Mnemonic,
    itemId: 'srp-3',
    dataType: EncAccountDataType.ImportedSrp,
    createdAt: '00000003-0000-1000-8000-000000000003',
  },
  {
    data: new Uint8Array(Buffer.from('seedPhrase2', 'utf-8')),
    timestamp: 20,
    type: SecretType.Mnemonic,
    itemId: 'srp-2',
    dataType: EncAccountDataType.ImportedSrp,
    createdAt: '00000002-0000-1000-8000-000000000002',
  },
];

type MockSecretDataInput = {
  data: Uint8Array;
  timestamp?: number;
  type?: SecretType;
  itemId: string;
  dataType?: EncAccountDataType;
  createdAt?: string;
};

/**
 * Creates a mock secret data get response
 *
 * @param secretDataArr - The data to be returned
 * @param password - The password to be used
 * @returns The mock secret data get response
 */
export function createMockSecretDataGetResponse(
  secretDataArr: MockSecretDataInput[],
  password: string,
): {
  success: boolean;
  data: string[];
  ids: string[];
  dataTypes: (EncAccountDataType | null)[];
  createdAt: (string | null)[];
} {
  const mockToprfEncryptor = new MockToprfEncryptorDecryptor();
  const ids: string[] = [];
  const dataTypes: (EncAccountDataType | null)[] = [];
  const createdAt: (string | null)[] = [];

  const encryptedSecretData = secretDataArr.map((secretData) => {
    const b64SecretData = Buffer.from(secretData.data).toString('base64');
    const timestamp = secretData.timestamp ?? Date.now();

    ids.push(secretData.itemId);
    dataTypes.push(secretData.dataType ?? null);
    createdAt.push(secretData.createdAt ?? null);

    const metadata = JSON.stringify({
      data: b64SecretData,
      timestamp,
      type: secretData.type,
    });

    return mockToprfEncryptor.encrypt(
      mockToprfEncryptor.deriveEncKey(password),
      new Uint8Array(Buffer.from(metadata, 'utf-8')),
    );
  });

  return {
    success: true,
    data: encryptedSecretData,
    ids,
    dataTypes,
    createdAt,
  };
}
