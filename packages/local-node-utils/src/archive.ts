import { runCommand } from './command.js';

export async function extractTarGzArchive(
  archivePath: string,
  destination: string,
): Promise<void> {
  await runCommand('tar', ['-xzf', archivePath, '-C', destination]);
}

export async function extractTarBz2Archive(
  archivePath: string,
  destination: string,
): Promise<void> {
  await runCommand('tar', ['-xjf', archivePath, '-C', destination]);
}
