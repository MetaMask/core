import { define, pattern, string } from '@metamask/superstruct';

export const NumberStringSchema = define<string>(
  'NumberString',
  (value: unknown) => typeof value === 'string' && /^\d+$/u.test(value),
);

export const TruthyDigitStringSchema = pattern(string(), /^\d+$/u);

export const FloatStringSchema = define<string>(
  'FloatString',
  (value: unknown) => typeof value === 'string' && /^-*\d*\.*\d+$/u.test(value),
);
