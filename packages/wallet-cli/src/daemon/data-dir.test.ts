import { mkdirSync } from 'node:fs';
import { chmod } from 'node:fs/promises';

import { ensureOwnerOnlyDirectory } from './data-dir';

jest.mock('node:fs');
jest.mock('node:fs/promises');

const mockMkdirSync = jest.mocked(mkdirSync);
const mockChmod = jest.mocked(chmod);

describe('ensureOwnerOnlyDirectory', () => {
  beforeEach(() => {
    mockChmod.mockResolvedValue(undefined);
  });

  it('creates the directory recursively with owner-only mode', async () => {
    await ensureOwnerOnlyDirectory('/tmp/data');

    expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/data', {
      recursive: true,
      mode: 0o700,
    });
  });

  it('chmods the directory to owner-only after creating it', async () => {
    await ensureOwnerOnlyDirectory('/tmp/data');

    expect(mockChmod).toHaveBeenCalledWith('/tmp/data', 0o700);
  });

  it('propagates errors from chmod', async () => {
    mockChmod.mockRejectedValue(new Error('chmod failed'));

    await expect(ensureOwnerOnlyDirectory('/tmp/data')).rejects.toThrow(
      'chmod failed',
    );
  });
});
