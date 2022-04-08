// uint32 (two's complement) max
// more conservative than Number.MAX_SAFE_INTEGER
const MAX = 4_294_967_295;
let idCounter = Math.floor(Math.random() * MAX);

/**
 * Gets an ID that is guaranteed to be unique so long as no more than
 * 4_294_967_295 (uint32 max) IDs are created, or the IDs are rapidly turned
 * over.
 *
 * @returns The unique ID.
 */
export function getUniqueId(): number {
  idCounter = (idCounter + 1) % MAX;
  return idCounter;
}
