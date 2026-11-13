// jsdom swaps in its own `Uint8Array` and `ArrayBuffer`, so bytes produced by
// Node APIs (`TextEncoder`, `crypto`) fail `instanceof` checks in
// `@metamask/utils` and `@noble/hashes`. Node's `TextEncoder` is left in place,
// so its output leads us back to Node's constructors.
const nodeBytes = new TextEncoder().encode('');
globalThis.Uint8Array = nodeBytes.constructor as Uint8ArrayConstructor;
globalThis.ArrayBuffer = nodeBytes.buffer.constructor as ArrayBufferConstructor;

export {};
