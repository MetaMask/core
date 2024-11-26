import encryption, { createSHA256Hash } from './encryption';

describe('encryption tests', () => {
  const PASSWORD = '123';
  const DATA1 = 'Hello World';
  const DATA2 = JSON.stringify({ foo: 'bar' });

  it('should encrypt and decrypt data', async () => {
    const actEncryptDecrypt = async (data: string) => {
      const encryptedString = await encryption.encryptString(data, PASSWORD);
      const decryptString = await encryption.decryptString(
        encryptedString,
        PASSWORD,
      );
      return decryptString;
    };

    expect(await actEncryptDecrypt(DATA1)).toBe(DATA1);
    expect(await actEncryptDecrypt(DATA2)).toBe(DATA2);
  });

  it('should decrypt some existing data', async () => {
    const encryptedData = `{"v":"1","t":"scrypt","d":"WNEp1QXUZsxCfW9b27uzZ18CtsMvKP6+cqLq8NLAItXeYcFcUjtKprfvedHxf5JN9Q7pe50qnA==","o":{"N":131072,"r":8,"p":1,"dkLen":16},"saltLen":16}`;
    const result = await encryption.decryptString(encryptedData, PASSWORD);
    expect(result).toBe(DATA1);
  });

  it('should sha-256 hash a value and should be deterministic', () => {
    const DATA = 'Hello World';
    const EXPECTED_HASH =
      'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e';

    const hash1 = createSHA256Hash(DATA);
    expect(hash1).toBe(EXPECTED_HASH);

    // Hash should be deterministic (same output with same input)
    const hash2 = createSHA256Hash(DATA);
    expect(hash1).toBe(hash2);
  });

  it('should be able to get the salt from an encrypted string', async () => {
    const encryptedData = `{"v":"1","t":"scrypt","d":"d9k8wRtOOq97OyNqRNnTCa3ct7+z9nRjV75Am+ND9yMoV/bMcnrzZqO2EhjL3viJyA==","o":{"N":131072,"r":8,"p":1,"dkLen":16},"saltLen":16}`;
    const saltUsedToPreviouslyEncryptData = new Uint8Array([
      119, 217, 60, 193, 27, 78, 58, 175, 123, 59, 35, 106, 68, 217, 211, 9,
    ]);

    const salt = encryption.getSalt(encryptedData);
    expect(salt).toBeInstanceOf(Uint8Array);
    expect(salt).toHaveLength(16);
    expect(salt).toStrictEqual(saltUsedToPreviouslyEncryptData);
  });
});
