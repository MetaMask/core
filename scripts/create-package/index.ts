import yargs from 'yargs';

import { createPackage } from './create-package';

(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  yargs
    .scriptName('create-package')
    .usage('$0 create-package')
    .command(
      'create-package',
      'Create a new monorepo package',
      (_yargsInstance) => createPackage(),
    )
    .demandCommand(1, 'You must specify a command.')
    .strict()
    .help()
    .alias('help', 'h').argv;
})();
