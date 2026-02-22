#!/usr/bin/env tsx

import { main } from './main';

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
