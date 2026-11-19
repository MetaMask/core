import { main } from './create-codeownership-summary/main.ts';

main({
  argv: process.argv,
  stdout: process.stdout,
  stderr: process.stderr,
  cwd: process.cwd(),
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
