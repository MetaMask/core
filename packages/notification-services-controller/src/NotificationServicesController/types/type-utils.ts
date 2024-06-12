/**
 * Computes and combines intersection types for a more "prettier" type (more human readable)
 */
export type Compute<Item> = Item extends Item
  ? { [K in keyof Item]: Item[K] }
  : never;
