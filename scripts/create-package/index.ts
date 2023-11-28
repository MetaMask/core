#!yarn ts-node

import cli from './cli';

cli(process.argv).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
