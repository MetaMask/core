import { main } from './manage-codeowners/main.js';

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
