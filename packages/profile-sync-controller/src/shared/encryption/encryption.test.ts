import encryption, { createSHA256Hash } from './encryption';

describe('encryption tests', () => {
  const PASSWORD = '123';
  const DATA1 = 'Hello World';
  const DATA2 = JSON.stringify({ foo: 'bar' });

  const ACCOUNTS_PASSWORD =
    '0d55d30da233959674d14076737198c05ae3fb8631a17e20d3c28c60dddd82f7';
  const ACCOUNTS_ENCRYPTED_DATA_WITH_SALT =
    '{"v":"1","t":"scrypt","d":"1yC/ZXarV57HbqEZ46nH0JWgXfPl86nTHD7kai2g5gm290FM9tw5QjOaAAwIuQESEE8TIM/J9pIj7nmlGi+BZrevTtK3DXWXwnUQsCP7amKd5Q4gs3EEQgXpA0W+WJUgyElj869rwIv/C6tl5E2pK4j/0EAjMSIm1TGoj9FPohyRgZsOIt8VhZfb7w0GODsjPwPIkN6zazvJ3gAFYFPh7yRtebFs86z3fzqCWZ9zakdCHntchC2oZiaApXR9yzaPlGgnPg==","o":{"N":131072,"r":8,"p":1,"dkLen":16},"saltLen":16}';
  const ACCOUNTS_DECRYPTED_DATA =
    '{"v":"1","a":"0xd2a4afe5c2ff0a16bf81f77ba4201a8107aa874b","i":"c590ab50-add6-4de4-8af7-9b696b5e9c6a","n":"My Second Synced Account","nlu":1729234343749}';

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

  it('should throw an error when trying to get the salt from an unsupported encrypted string', () => {
    const encryptedData = `{"v":"1","t":"unsupported","d":"d9k8wRtOOq97OyNqRNnTCa3ct7+z9nRjV75Am+ND9yMoV/bMcnrzZqO2EhjL3viJyA==","o":{"N":131072,"r":8,"p":1,"dkLen":16},"saltLen":16}`;
    expect(() => encryption.getSalt(encryptedData)).toThrow(
      `Unsupported encrypted data payload - ${encryptedData}`,
    );
  });

  it('should be able to decrypt an entry that has no salt', async () => {
    const encryptedData = await encryption.encryptString(DATA1, PASSWORD);
    const decryptedData = await encryption.decryptString(
      encryptedData,
      PASSWORD,
    );
    expect(decryptedData).toBe(DATA1);
  });

  it('should be able to decrypt an entry that has a salt', async () => {
    const decryptedData = await encryption.decryptString(
      ACCOUNTS_ENCRYPTED_DATA_WITH_SALT,
      ACCOUNTS_PASSWORD,
    );
    expect(decryptedData).toBe(ACCOUNTS_DECRYPTED_DATA);
  });

  describe('getIfEntriesHaveDifferentSalts()', () => {
    it('should return true if entries have different salts', () => {
      const entries = [
        '{"v":"1","t":"scrypt","d":"1yC/ZXarV57HbqEZ46nH0JWgXfPl86nTHD7kai2g5gm290FM9tw5QjOaAAwIuQESEE8TIM/J9pIj7nmlGi+BZrevTtK3DXWXwnUQsCP7amKd5Q4gs3EEQgXpA0W+WJUgyElj869rwIv/C6tl5E2pK4j/0EAjMSIm1TGoj9FPohyRgZsOIt8VhZfb7w0GODsjPwPIkN6zazvJ3gAFYFPh7yRtebFs86z3fzqCWZ9zakdCHntchC2oZiaApXR9yzaPlGgnPg==","o":{"N":131072,"r":8,"p":1,"dkLen":16},"saltLen":16}',
        '{"v":"1","t":"scrypt","d":"x7QqsdqsdEtUo7q/jG+UNkD/HOxQARGGRXsGPrLsDlkwDfgfoYlPI0To/M3pJRBlKD0RLEFIPHtHBEA5bv/2izB21VljvhMnhHfo0KgQ+e8Uq1t7grwa+r+ge3qbPNY+w78Xt8GtC+Hkrw5fORKvCn+xjzaCHYV6RxKYbp1TpyCJq7hDrr1XiyL8kqbpE0hAHALrrQOoV9/WXJi9pC5J118kquXx8CNA1P5wO/BXKp1AbryGR6kVW3lsp1sy3lYE/TApa5lTj+","o":{"N":131072,"r":8,"p":1,"dkLen":16},"saltLen":16}',
      ];

      const result = encryption.getIfEntriesHaveDifferentSalts(entries);
      expect(result).toBe(true);
    });

    it('should return false if entries have the same salts', () => {
      const entries = [
        '{"v":"1","t":"scrypt","d":"+nhJkMMjQljyyyytsnhO4dIzFL/hGR4Y6hb2qUGrPb/hjxHVJUk1jcJAyHP9eUzgZQ==","o":{"N":131072,"r":8,"p":1,"dkLen":16},"saltLen":16}',
        '{"v":"1","t":"scrypt","d":"+nhJkMMjQljyyyytsnhO4XYxpF0N3IXuhCpPM9dAyw5pO2gcqcXNucJs60rBtgKttA==","o":{"N":131072,"r":8,"p":1,"dkLen":16},"saltLen":16}',
      ];

      const result = encryption.getIfEntriesHaveDifferentSalts(entries);
      expect(result).toBe(false);
    });

    it('should return false if entries do not have salts', () => {
      const entries = [
        '{"v":"1","t":"scrypt","d":"CgHcOM6xCaaNFnPCr0etqyxCq4xoJNQ9gfP9+GRn94hGtKurbOuXzyDoHJgzaJxDKd1zQHJhDwLjnH6oCZvC8XKvZZ6RcrN9BicZHpzpojon+HwpcPHceM/pvoMabYfiXqbokYHXZymGTxE5X+TjFo+HB7/Y6xOCU1usz47bru9vfyZrdQ66qGlMO2MUFx00cnh8xHOksDNC","o":{"N":131072,"r":8,"p":1,"dkLen":16},"saltLen":0}',
        '{"v":"1","t":"scrypt","d":"OCrYnCFkt7a33cjaAL65D/WypM+oVxIiGVwMk+mjijcpnG4r3vzPl6OzFpx2LNKHj6YN59wcLje3QK2hISU0R8iXyZubdkeAiY89SsI7owLda96ysF+q6PuyxnWfNfWe+5a1+4O8BVkR8p/9PYimwTN0QGhX2lkfLt5r0aYgsLnWld/5k9G7cB4yqoduIopzpojS5ZGI8PFW","o":{"N":131072,"r":8,"p":1,"dkLen":16},"saltLen":0}',
      ];

      const result = encryption.getIfEntriesHaveDifferentSalts(entries);
      expect(result).toBe(false);
    });
  });
});
