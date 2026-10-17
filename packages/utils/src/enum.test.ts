import { createEnum } from './enum.js';

describe('createEnum', () => {
  const Duration = createEnum({
    Millisecond: 1,
    Second: 1000,
    Minute: 60_000,
  });

  const Namespace = createEnum({
    Bip122: 'bip122',
    Solana: 'solana',
    Stellar: 'stellar',
  });

  it('creates an enum with number values usable by property name', () => {
    expect(Duration.Millisecond).toBe(1);
    expect(Duration.Second).toBe(1000);
    expect(Duration.Minute).toBe(60_000);
  });

  it('creates an enum with number values usable by property value', () => {
    expect(Duration[1]).toBe('Millisecond');
    expect(Duration[1000]).toBe('Second');
    expect(Duration[60_000]).toBe('Minute');
  });

  it('creates an enum with string values usable by property name', () => {
    expect(Namespace.Bip122).toBe('bip122');
    expect(Namespace.Solana).toBe('solana');
    expect(Namespace.Stellar).toBe('stellar');
  });

  it('does not create reverse mapping for string values', () => {
    expect(Namespace).not.toHaveProperty('bip122');
    expect(Namespace).not.toHaveProperty('solana');
    expect(Namespace).not.toHaveProperty('stellar');
  });

  it('maps duplicate number values to the last matching property name', () => {
    const JsonSize = createEnum({ Comma: 1, Quote: 1, Null: 4, True: 4 });

    expect(JsonSize[1]).toBe('Quote');
    expect(JsonSize[4]).toBe('True');
  });
});
