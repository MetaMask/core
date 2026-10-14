import { encryptorFactory } from './encryptor.js';

describe('encryptorFactory', () => {
  const encryptor = encryptorFactory(600_000);

  it('encrypts/decrypts using a password', async () => {
    const password = 'password';
    const data = { foo: 'bar' };

    const encrypted = await encryptor.encrypt(password, data);

    expect(JSON.parse(encrypted)).toStrictEqual({
      data: expect.any(String),
      iv: expect.any(String),
      salt: expect.any(String),
      keyMetadata: {
        algorithm: 'PBKDF2',
        params: {
          iterations: 600_000,
        },
      },
    });

    expect(await encryptor.decrypt(password, encrypted)).toStrictEqual(data);
  });

  it('encrypts/decrypts with detail using a password', async () => {
    const password = 'foo';
    const data = { bar: 'baz' };

    const encrypted = await encryptor.encryptWithDetail(password, data);

    expect(encrypted).toStrictEqual({
      vault: expect.any(String),
      exportedKeyString: expect.any(String),
    });

    const decrypted = await encryptor.decryptWithDetail(
      password,
      encrypted.vault,
    );

    expect(decrypted.exportedKeyString).toStrictEqual(
      encrypted.exportedKeyString,
    );
    expect(decrypted.vault).toStrictEqual(data);
  });
});
