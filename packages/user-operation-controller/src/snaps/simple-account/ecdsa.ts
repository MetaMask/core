/* eslint-disable jsdoc/require-jsdoc */

import { arrayify } from '@ethersproject/bytes';
import { Wallet } from '@ethersproject/wallet';

export function signHash(hash: string, privateKey: string): Promise<string> {
  const data = arrayify(hash);
  const signer = new Wallet(privateKey);
  return signer.signMessage(data);
}
