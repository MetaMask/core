// Type definitions for compatibility with legacy TypeScript module resolution.
// Node16/NodeNext resolution uses the "exports" field in package.json,
// but legacy resolution needs explicit .d.ts files at the import path.

// Re-export all types and values from the CommonJS build
// eslint-disable-next-line import-x/no-useless-path-segments
export * from './dist/next/index.cjs';
