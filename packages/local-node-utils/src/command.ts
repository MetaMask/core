/* eslint-disable import-x/no-nodejs-modules */
import { spawn } from 'node:child_process';

export async function runCommand(
  command: string,
  args: string[],
): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', rejectPromise);
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      const exitStatus = signal ? `signal ${signal}` : `code ${code ?? 'null'}`;
      rejectPromise(
        new Error(
          `${command} ${args.join(' ')} failed with ${exitStatus}: ${stderr}`,
        ),
      );
    });
  });
}
