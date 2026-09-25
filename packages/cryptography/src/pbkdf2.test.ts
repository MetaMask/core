import { stringToBytes, bytesToHex, hexToBytes } from '@metamask/utils';

import { pbkdf2Sha256, pbkdf2Sha384, pbkdf2Sha512 } from './pbkdf2.js';

const password = stringToBytes('foo') as Uint8Array<ArrayBuffer>;
const salt = hexToBytes(
  '0xf38a650903309967f2073b437852f77c87af7529cd5c85f4d2bdcf470083553c',
) as Uint8Array<ArrayBuffer>;

// RFC 7914 Test Case 1: P = "passwd", S = "salt", c = 1
// https://www.rfc-editor.org/rfc/rfc7914#section-11
const rfc7914Password = stringToBytes('passwd') as Uint8Array<ArrayBuffer>;
const rfc7914Salt = stringToBytes('salt') as Uint8Array<ArrayBuffer>;

// PBKDF2-HMAC-SHA-512 test vectors: P = "password", S = "salt", c = 1 and c = 2
// https://github.com/python/cpython/blob/main/Lib/test/test_hashlib.py
const cpythonPassword = stringToBytes('password') as Uint8Array<ArrayBuffer>;
const cpythonSalt = stringToBytes('salt') as Uint8Array<ArrayBuffer>;

describe('pbkdf2Sha256', () => {
  it('generates a key from a password and a salt using the provided derivation parameters', async () => {
    const key = await pbkdf2Sha256(password, salt, 600_000, 256);
    expect(bytesToHex(key)).toBe(
      '0x62eb95fe985a1780627ba16f5b04f76005353bf24a41a033f2bac0abd65a1b4a7c19e82f58115dcca4e43a591823244000d5fdc238f5de7f264d08c92bede92ac0140614633659dcecb1f128067be4786dff91623ed605ecf9951950d19c7357d3a53ce0aa212452ee0af11c4449f418f2ea870006934f45a341e05f97d5fc705989a13bfbc4a3212eff2399b65a63e9101c4cab9cb673f663cf296107635a61d479f3f86a9d7d1574d8d07a48c386dfb0b8c21542627a17b907ab4edf1f7daaa79e560890f4264b9fb5d1196df18a91124337108e05a9d4128d0863cc211c86af307eea266c0e73cdd4026ae0597d03a7f74507488f62834608581642315c81',
    );
  });

  it('accepts an ArrayBuffer password and salt', async () => {
    const key = await pbkdf2Sha256(password.buffer, salt.buffer, 600_000, 256);
    expect(bytesToHex(key)).toBe(
      '0x62eb95fe985a1780627ba16f5b04f76005353bf24a41a033f2bac0abd65a1b4a7c19e82f58115dcca4e43a591823244000d5fdc238f5de7f264d08c92bede92ac0140614633659dcecb1f128067be4786dff91623ed605ecf9951950d19c7357d3a53ce0aa212452ee0af11c4449f418f2ea870006934f45a341e05f97d5fc705989a13bfbc4a3212eff2399b65a63e9101c4cab9cb673f663cf296107635a61d479f3f86a9d7d1574d8d07a48c386dfb0b8c21542627a17b907ab4edf1f7daaa79e560890f4264b9fb5d1196df18a91124337108e05a9d4128d0863cc211c86af307eea266c0e73cdd4026ae0597d03a7f74507488f62834608581642315c81',
    );
  });

  it('accepts a DataView password and salt', async () => {
    const key = await pbkdf2Sha256(
      new DataView(password.buffer),
      new DataView(salt.buffer),
      600_000,
      256,
    );
    expect(bytesToHex(key)).toBe(
      '0x62eb95fe985a1780627ba16f5b04f76005353bf24a41a033f2bac0abd65a1b4a7c19e82f58115dcca4e43a591823244000d5fdc238f5de7f264d08c92bede92ac0140614633659dcecb1f128067be4786dff91623ed605ecf9951950d19c7357d3a53ce0aa212452ee0af11c4449f418f2ea870006934f45a341e05f97d5fc705989a13bfbc4a3212eff2399b65a63e9101c4cab9cb673f663cf296107635a61d479f3f86a9d7d1574d8d07a48c386dfb0b8c21542627a17b907ab4edf1f7daaa79e560890f4264b9fb5d1196df18a91124337108e05a9d4128d0863cc211c86af307eea266c0e73cdd4026ae0597d03a7f74507488f62834608581642315c81',
    );
  });

  it('matches RFC 7914 test case 1', async () => {
    const key = await pbkdf2Sha256(rfc7914Password, rfc7914Salt, 1, 64, {
      unsafeIterations: true,
    });
    expect(bytesToHex(key)).toBe(
      '0x55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783',
    );
  });

  it('throws if the number of iterations is below the recommended minimum', async () => {
    await expect(pbkdf2Sha256(password, salt, 599_999, 256)).rejects.toThrow(
      'Iterations must be at least 600000 for PBKDF2-SHA-256.',
    );
  });
});

describe('pbkdf2Sha384', () => {
  it('generates a key from a password and a salt using the provided derivation parameters', async () => {
    const key = await pbkdf2Sha384(password, salt, 600_000, 384);
    expect(bytesToHex(key)).toBe(
      '0x64a93fc358bbe86bf7dd04820614b3e1c9389479726fc2720c60883bc10a21315301407562fae64c895a069d26e341b919901ecafdd1663deab6614c0d40812b2301628102c9899f0b33c388118129e69ff28337dba7002119c017c2f38c131c4021e67516da7ef113c20b72eed3839bef447b5b83f5379c9d171aaeb731eb5877bb77e50a83081ce8250da6ce07f0f1d824f9cabbb27804220a60bd862eed9acd41ec20132b7b29a8a178078c8ecd8b2fa4538e5d0115a07f081fe01d8514eb32693ee7dc08efd3db25dce599eaee84234e50af55de999c0bfda4e9c17cdea02bdf70d339dd572afcc899d08f493e94f7bcd143e4634e9e5d5715321bdef0c46d5d53869f97264b87176f047b09465c7da6096dbeaadc367f9c4bcc9ee0f2e9ffab1896e46ffcde0a951173299da6e9f6bce34487bc282297f870c62a5530f98729db627498bc483478b630edc054f6bcf1d3be0799e2e2fbca0b251c08b556f252f4f8318adbf6206a26789440cf43601b9ce7bb9514970dd73bd7f8bb44fc',
    );
  });

  it('accepts an ArrayBuffer password and salt', async () => {
    const key = await pbkdf2Sha384(password.buffer, salt.buffer, 600_000, 384);
    expect(bytesToHex(key)).toBe(
      '0x64a93fc358bbe86bf7dd04820614b3e1c9389479726fc2720c60883bc10a21315301407562fae64c895a069d26e341b919901ecafdd1663deab6614c0d40812b2301628102c9899f0b33c388118129e69ff28337dba7002119c017c2f38c131c4021e67516da7ef113c20b72eed3839bef447b5b83f5379c9d171aaeb731eb5877bb77e50a83081ce8250da6ce07f0f1d824f9cabbb27804220a60bd862eed9acd41ec20132b7b29a8a178078c8ecd8b2fa4538e5d0115a07f081fe01d8514eb32693ee7dc08efd3db25dce599eaee84234e50af55de999c0bfda4e9c17cdea02bdf70d339dd572afcc899d08f493e94f7bcd143e4634e9e5d5715321bdef0c46d5d53869f97264b87176f047b09465c7da6096dbeaadc367f9c4bcc9ee0f2e9ffab1896e46ffcde0a951173299da6e9f6bce34487bc282297f870c62a5530f98729db627498bc483478b630edc054f6bcf1d3be0799e2e2fbca0b251c08b556f252f4f8318adbf6206a26789440cf43601b9ce7bb9514970dd73bd7f8bb44fc',
    );
  });

  it('accepts a DataView password and salt', async () => {
    const key = await pbkdf2Sha384(
      new DataView(password.buffer),
      new DataView(salt.buffer),
      600_000,
      384,
    );
    expect(bytesToHex(key)).toBe(
      '0x64a93fc358bbe86bf7dd04820614b3e1c9389479726fc2720c60883bc10a21315301407562fae64c895a069d26e341b919901ecafdd1663deab6614c0d40812b2301628102c9899f0b33c388118129e69ff28337dba7002119c017c2f38c131c4021e67516da7ef113c20b72eed3839bef447b5b83f5379c9d171aaeb731eb5877bb77e50a83081ce8250da6ce07f0f1d824f9cabbb27804220a60bd862eed9acd41ec20132b7b29a8a178078c8ecd8b2fa4538e5d0115a07f081fe01d8514eb32693ee7dc08efd3db25dce599eaee84234e50af55de999c0bfda4e9c17cdea02bdf70d339dd572afcc899d08f493e94f7bcd143e4634e9e5d5715321bdef0c46d5d53869f97264b87176f047b09465c7da6096dbeaadc367f9c4bcc9ee0f2e9ffab1896e46ffcde0a951173299da6e9f6bce34487bc282297f870c62a5530f98729db627498bc483478b630edc054f6bcf1d3be0799e2e2fbca0b251c08b556f252f4f8318adbf6206a26789440cf43601b9ce7bb9514970dd73bd7f8bb44fc',
    );
  });

  it('throws if the number of iterations is below the recommended minimum', async () => {
    await expect(pbkdf2Sha384(password, salt, 219_999, 384)).rejects.toThrow(
      'Iterations must be at least 220000 for PBKDF2-SHA-384.',
    );
  });
});

describe('pbkdf2Sha512', () => {
  it('generates a key from a password and a salt using the provided derivation parameters', async () => {
    const key = await pbkdf2Sha512(password, salt, 600_000, 512);
    expect(bytesToHex(key)).toBe(
      '0x32fab6b40947afe4f9bcedda67c57ee61809f9e32e059501a006d1d0f4b45f445e49786450cfdf5c762e08392762ccb421501e84d85ed17cedc1bad71f3287ca33471d2d7052fe01ea95cc64b5d7f017a12cb1399674ecbee0c4472dfc1a2594cd836c7db901b3ce3f70ad838285305a0e87b1c434866a7a264efa623bb4d20b26ec5ec96fe5e266cc29c56407f521773f3e837ece8ba130fe1555ef2ea30bc4ee06fe130ba39d03088e62a16a02b2ab477ff34da7abb0417bfcfa8f5c49a0f9333dcd874e25719aecf2ed899806a7904e025ffb271fa6b32100d5674980f5b56e73aa0268dbb0b766d8c32123cc5a290635e5c583c5e3b38c21df18b22ebe792cf1ca79adacdf6dd67ef3ce0c78f85dd38fda8d38e629a70ee10c1592ec25b38ccf3296d2a6389f001ed4f63e0cf59a4e5a0048c5779fae106abc1af09b80daf191da25c75f26d33b4dd9bfa73ccade1c6495cc7fc7ba326ee241eef0e76f2b7eb1c3b0b24fb9dc5f054ad7ad19a0053bd9682a2f835322734a29c909d4e4648eec3310b566af1bc599862f00e79272fc28db483764c5d1ee9cc8433e7f5f439352bf38afade971be7c5dbc8aa3fdaffb474fea8a0db73ad2744cf1f8b86c3df4dd44008fa66c2ae388e7bacff6ea9c6d4eaf4e82377b77e82c2b3ad243b46831c95c00f062a347b2efffa2077fc7adef433d8552f51c80159b6fce2ec73bbb',
    );
  });

  it('accepts an ArrayBuffer password and salt', async () => {
    const key = await pbkdf2Sha512(password.buffer, salt.buffer, 600_000, 512);
    expect(bytesToHex(key)).toBe(
      '0x32fab6b40947afe4f9bcedda67c57ee61809f9e32e059501a006d1d0f4b45f445e49786450cfdf5c762e08392762ccb421501e84d85ed17cedc1bad71f3287ca33471d2d7052fe01ea95cc64b5d7f017a12cb1399674ecbee0c4472dfc1a2594cd836c7db901b3ce3f70ad838285305a0e87b1c434866a7a264efa623bb4d20b26ec5ec96fe5e266cc29c56407f521773f3e837ece8ba130fe1555ef2ea30bc4ee06fe130ba39d03088e62a16a02b2ab477ff34da7abb0417bfcfa8f5c49a0f9333dcd874e25719aecf2ed899806a7904e025ffb271fa6b32100d5674980f5b56e73aa0268dbb0b766d8c32123cc5a290635e5c583c5e3b38c21df18b22ebe792cf1ca79adacdf6dd67ef3ce0c78f85dd38fda8d38e629a70ee10c1592ec25b38ccf3296d2a6389f001ed4f63e0cf59a4e5a0048c5779fae106abc1af09b80daf191da25c75f26d33b4dd9bfa73ccade1c6495cc7fc7ba326ee241eef0e76f2b7eb1c3b0b24fb9dc5f054ad7ad19a0053bd9682a2f835322734a29c909d4e4648eec3310b566af1bc599862f00e79272fc28db483764c5d1ee9cc8433e7f5f439352bf38afade971be7c5dbc8aa3fdaffb474fea8a0db73ad2744cf1f8b86c3df4dd44008fa66c2ae388e7bacff6ea9c6d4eaf4e82377b77e82c2b3ad243b46831c95c00f062a347b2efffa2077fc7adef433d8552f51c80159b6fce2ec73bbb',
    );
  });

  it('accepts a DataView password and salt', async () => {
    const key = await pbkdf2Sha512(
      new DataView(password.buffer),
      new DataView(salt.buffer),
      600_000,
      512,
    );
    expect(bytesToHex(key)).toBe(
      '0x32fab6b40947afe4f9bcedda67c57ee61809f9e32e059501a006d1d0f4b45f445e49786450cfdf5c762e08392762ccb421501e84d85ed17cedc1bad71f3287ca33471d2d7052fe01ea95cc64b5d7f017a12cb1399674ecbee0c4472dfc1a2594cd836c7db901b3ce3f70ad838285305a0e87b1c434866a7a264efa623bb4d20b26ec5ec96fe5e266cc29c56407f521773f3e837ece8ba130fe1555ef2ea30bc4ee06fe130ba39d03088e62a16a02b2ab477ff34da7abb0417bfcfa8f5c49a0f9333dcd874e25719aecf2ed899806a7904e025ffb271fa6b32100d5674980f5b56e73aa0268dbb0b766d8c32123cc5a290635e5c583c5e3b38c21df18b22ebe792cf1ca79adacdf6dd67ef3ce0c78f85dd38fda8d38e629a70ee10c1592ec25b38ccf3296d2a6389f001ed4f63e0cf59a4e5a0048c5779fae106abc1af09b80daf191da25c75f26d33b4dd9bfa73ccade1c6495cc7fc7ba326ee241eef0e76f2b7eb1c3b0b24fb9dc5f054ad7ad19a0053bd9682a2f835322734a29c909d4e4648eec3310b566af1bc599862f00e79272fc28db483764c5d1ee9cc8433e7f5f439352bf38afade971be7c5dbc8aa3fdaffb474fea8a0db73ad2744cf1f8b86c3df4dd44008fa66c2ae388e7bacff6ea9c6d4eaf4e82377b77e82c2b3ad243b46831c95c00f062a347b2efffa2077fc7adef433d8552f51c80159b6fce2ec73bbb',
    );
  });

  it('matches CPython test case 1 (c=1)', async () => {
    const key = await pbkdf2Sha512(cpythonPassword, cpythonSalt, 1, 64, {
      unsafeIterations: true,
    });
    expect(bytesToHex(key)).toBe(
      '0x867f70cf1ade02cff3752599a3a53dc4af34c7a669815ae5d513554e1c8cf252c02d470a285a0501bad999bfe943c08f050235d7d68b1da55e63f73b60a57fce',
    );
  });

  it('matches CPython test case 2 (c=2)', async () => {
    const key = await pbkdf2Sha512(cpythonPassword, cpythonSalt, 2, 64, {
      unsafeIterations: true,
    });
    expect(bytesToHex(key)).toBe(
      '0xe1d9c16aa681708a45f5c7c4e215ceb66e011a2e9f0040713f18aefdb866d53cf76cab2868a39b9f7840edce4fef5a82be67335c77a6068e04112754f27ccf4e',
    );
  });

  it('throws if the number of iterations is below the recommended minimum', async () => {
    await expect(pbkdf2Sha512(password, salt, 219_999, 512)).rejects.toThrow(
      'Iterations must be at least 220000 for PBKDF2-SHA-512.',
    );
  });
});
