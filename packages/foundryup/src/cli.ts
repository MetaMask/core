#!/usr/bin/env node

/**
 * CLI entry point for Foundryup.
 *
 * This script downloads and installs Foundry binaries.
 * If an error occurs, it logs the error and exits with code 1.
 */
import { downloadAndInstallFoundryBinaries } from '.';

/**
 * Run the main installation process and handle errors.
 */
downloadAndInstallFoundryBinaries().catch((error) => {
  /**
   * Log any error that occurs during installation and exit with code 1.
   *
   * @param error - The error thrown during installation.
   */
  console.error('Error:', error);
  process.exit(1);
});
