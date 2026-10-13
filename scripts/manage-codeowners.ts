import { main } from './manage-codeowners/main.ts';

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
