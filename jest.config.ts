import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  // Run tests from one or more projects
  // This is all we need in this file because each package has its own Jest
  // config
  projects: ['<rootDir>/packages/*'],
};

export default config;
