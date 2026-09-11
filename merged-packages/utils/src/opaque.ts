// We use a symbol property name instead of { _type: Brand }, because that would show up in IDE suggestions,
// while internal symbols do not.
declare const brand: unique symbol;
export type Opaque<Base, Brand extends symbol> = Base & { [brand]: Brand };
