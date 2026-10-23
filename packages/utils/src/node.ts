export * from './index.js';

// Re-exports for backwards compatibility.
export type { FileSandbox } from '@metamask/node-utils';
export {
  createSandbox,
  directoryExists,
  ensureDirectoryStructureExists,
  fileExists,
  forceRemove,
  readFile,
  readJsonFile,
  writeFile,
  writeJsonFile,
} from '@metamask/node-utils';
