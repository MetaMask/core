import type { InfoClient } from '@nktkas/hyperliquid';

import { createStandaloneInfoClient } from '../src/utils/standaloneInfoClient';

export type E2EResult = {
  scenario: string;
  status: 'pass' | 'fail';
  assertions: number;
  failed: number;
  durationMs: number;
  details: { name: string; ok: boolean; error?: string }[];
};

export function createClient(isTestnet = false): InfoClient {
  return createStandaloneInfoClient({ isTestnet, timeout: 30000 });
}

export class E2ERunner {
  readonly scenario: string;

  readonly #details: E2EResult['details'] = [];

  readonly #startTime = Date.now();

  constructor(scenario: string) {
    this.scenario = scenario;
  }

  assert(name: string, condition: boolean, error?: string): void {
    this.#details.push({ name, ok: condition, error: condition ? undefined : error });
    if (!condition) {
      console.error(`  FAIL: ${name}${error ? ` — ${error}` : ''}`);
    }
  }

  assertType(name: string, value: unknown, expected: string): void {
    const actual = typeof value;
    this.assert(name, actual === expected, `expected ${expected}, got ${actual}`);
  }

  assertGt(name: string, value: number, min: number): void {
    this.assert(name, value > min, `expected > ${min}, got ${value}`);
  }

  assertArray(name: string, value: unknown, minLength = 0): void {
    const isArr = Array.isArray(value);
    this.assert(`${name} is array`, isArr, `got ${typeof value}`);
    if (isArr) {
      this.assert(`${name} length >= ${minLength}`, value.length >= minLength, `got ${value.length}`);
    }
  }

  finish(): E2EResult {
    const failed = this.#details.filter((detail) => !detail.ok).length;
    const result: E2EResult = {
      scenario: this.scenario,
      status: failed > 0 ? 'fail' : 'pass',
      assertions: this.#details.length,
      failed,
      durationMs: Date.now() - this.#startTime,
      details: this.#details,
    };
    console.log(JSON.stringify(result, null, 2));
    return result;
  }
}
