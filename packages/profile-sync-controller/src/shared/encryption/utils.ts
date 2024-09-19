export const byteArrayToBase64 = (byteArray: Uint8Array) => {
  return Buffer.from(byteArray).toString('base64');
};

export const base64ToByteArray = (base64: string) => {
  return new Uint8Array(Buffer.from(base64, 'base64'));
};

export const bytesToUtf8 = (byteArray: Uint8Array) => {
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(byteArray);
};
