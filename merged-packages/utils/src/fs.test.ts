import fs from 'fs';
import { when } from 'jest-when';
import os from 'os';
import path from 'path';
import util from 'util';

import {
  createSandbox,
  directoryExists,
  ensureDirectoryStructureExists,
  fileExists,
  forceRemove,
  readFile,
  readJsonFile,
  writeFile,
  writeJsonFile,
} from './fs';

const { withinSandbox } = createSandbox('utils');

describe('fs', () => {
  describe('readFile', () => {
    it('reads the contents of the given file as a UTF-8-encoded string', async () => {
      expect.assertions(1);

      await withinSandbox(async (sandbox) => {
        const filePath = path.join(sandbox.directoryPath, 'test.file');

        await fs.promises.writeFile(filePath, 'some content 😄');

        expect(await readFile(filePath)).toBe('some content 😄');
      });
    });

    it('re-throws a wrapped version of any error that occurs, assigning it the same code and giving it a stack', async () => {
      expect.assertions(1);

      await withinSandbox(async (sandbox) => {
        const filePath = path.join(sandbox.directoryPath, 'nonexistent.file');

        await expect(readFile(filePath)).rejects.toThrow(
          expect.objectContaining({
            message: `Could not read file '${filePath}'`,
            code: 'ENOENT',
            stack: expect.any(String),
            cause: expect.objectContaining({
              message: `ENOENT: no such file or directory, open '${filePath}'`,
              code: 'ENOENT',
            }),
          }),
        );
      });
    });
  });

  describe('writeFile', () => {
    it('writes the given data to the given file', async () => {
      expect.assertions(1);

      await withinSandbox(async (sandbox) => {
        const filePath = path.join(sandbox.directoryPath, 'test.file');

        await writeFile(filePath, 'some content 😄');

        expect(await fs.promises.readFile(filePath, 'utf8')).toBe(
          'some content 😄',
        );
      });
    });

    it('re-throws a wrapped version of any error that occurs, assigning it the same code and giving it a stack', async () => {
      expect.assertions(1);

      await withinSandbox(async (sandbox) => {
        // Make sandbox root directory non-readable
        await fs.promises.chmod(sandbox.directoryPath, 0o600);
        const filePath = path.join(sandbox.directoryPath, 'test.file');

        await expect(writeFile(filePath, 'some content 😄')).rejects.toThrow(
          expect.objectContaining({
            message: `Could not write file '${filePath}'`,
            code: 'EACCES',
            stack: expect.any(String),
            cause: expect.objectContaining({
              code: 'EACCES',
            }),
          }),
        );
      });
    });
  });

  describe('readJsonFile', () => {
    describe('not given a custom parser', () => {
      it('reads the contents of the given file as a UTF-8-encoded string and parses it using the JSON module', async () => {
        expect.assertions(1);

        await withinSandbox(async (sandbox) => {
          const filePath = path.join(sandbox.directoryPath, 'test.json');

          await fs.promises.writeFile(filePath, '{"foo": "bar 😄"}');

          expect(await readJsonFile(filePath)).toStrictEqual({ foo: 'bar 😄' });
        });
      });

      it('re-throws a wrapped version of any error that occurs, assigning it the same code and giving it a stack', async () => {
        expect.assertions(1);

        await withinSandbox(async (sandbox) => {
          const filePath = path.join(sandbox.directoryPath, 'nonexistent.json');

          await expect(readJsonFile(filePath)).rejects.toThrow(
            expect.objectContaining({
              message: `Could not read JSON file '${filePath}'`,
              code: 'ENOENT',
              stack: expect.any(String),
              cause: expect.objectContaining({
                message: `ENOENT: no such file or directory, open '${filePath}'`,
                code: 'ENOENT',
              }),
            }),
          );
        });
      });
    });

    describe('given a custom parser', () => {
      it('reads the contents of the given file as a UTF-8-encoded string and parses it using the custom parser', async () => {
        expect.assertions(1);

        await withinSandbox(async (sandbox) => {
          const filePath = path.join(sandbox.directoryPath, 'test.json');
          const parser = {
            parse(content: string) {
              return { content };
            },
          };

          await fs.promises.writeFile(filePath, '{"foo": "bar 😄"}');

          expect(await readJsonFile(filePath, { parser })).toStrictEqual({
            content: '{"foo": "bar 😄"}',
          });
        });
      });

      it('re-throws a wrapped version of any error that occurs, assigning it the same code and giving it a stack', async () => {
        expect.assertions(1);

        await withinSandbox(async (sandbox) => {
          const filePath = path.join(sandbox.directoryPath, 'nonexistent.json');
          const parser = {
            parse(content: string) {
              return { content };
            },
          };

          await expect(readJsonFile(filePath, { parser })).rejects.toThrow(
            expect.objectContaining({
              message: `Could not read JSON file '${filePath}'`,
              code: 'ENOENT',
              stack: expect.any(String),
              cause: expect.objectContaining({
                message: `ENOENT: no such file or directory, open '${filePath}'`,
                code: 'ENOENT',
              }),
            }),
          );
        });
      });
    });
  });

  describe('writeJsonFile', () => {
    describe('not given a custom stringifier', () => {
      it('writes the given data to the given file as JSON (not reformatting it by default)', async () => {
        expect.assertions(1);

        await withinSandbox(async (sandbox) => {
          const filePath = path.join(sandbox.directoryPath, 'test.json');

          await writeJsonFile(filePath, { foo: 'bar 😄' });

          expect(await fs.promises.readFile(filePath, 'utf8')).toBe(
            '{"foo":"bar 😄"}',
          );
        });
      });

      it('writes the given data to the given file as JSON (not reformatting it if "prettify" is false)', async () => {
        expect.assertions(1);

        await withinSandbox(async (sandbox) => {
          const filePath = path.join(sandbox.directoryPath, 'test.json');

          await writeJsonFile(filePath, { foo: 'bar 😄' }, { prettify: false });

          expect(await fs.promises.readFile(filePath, 'utf8')).toBe(
            '{"foo":"bar 😄"}',
          );
        });
      });

      it('writes the given data to the given file as JSON (reformatting it if "prettify" is true)', async () => {
        expect.assertions(1);

        await withinSandbox(async (sandbox) => {
          const filePath = path.join(sandbox.directoryPath, 'test.json');

          await writeJsonFile(filePath, { foo: 'bar 😄' }, { prettify: true });

          expect(await fs.promises.readFile(filePath, 'utf8')).toBe(
            '{\n  "foo": "bar 😄"\n}',
          );
        });
      });

      it('re-throws a wrapped version of any error that occurs, assigning it the same code and giving it a stack', async () => {
        expect.assertions(1);

        await withinSandbox(async (sandbox) => {
          // Make sandbox root directory non-readable
          await fs.promises.chmod(sandbox.directoryPath, 0o600);
          const filePath = path.join(sandbox.directoryPath, 'test.json');

          await expect(
            writeJsonFile(filePath, { foo: 'bar 😄' }),
          ).rejects.toThrow(
            expect.objectContaining({
              message: `Could not write JSON file '${filePath}'`,
              code: 'EACCES',
              stack: expect.any(String),
              cause: expect.objectContaining({
                code: 'EACCES',
              }),
            }),
          );
        });
      });
    });

    describe('given a custom stringifier', () => {
      it('writes the given data to the given file as JSON, using the stringifier (not reformatting it by default)', async () => {
        expect.assertions(1);

        await withinSandbox(async (sandbox) => {
          const filePath = path.join(sandbox.directoryPath, 'test.json');
          const stringifier = {
            stringify(
              json: any,
              replacer?:
                | ((this: any, key: string, value: any) => any)
                | (number | string)[]
                | null,
              space?: string,
            ) {
              return (
                `${util.inspect(json)}\n` +
                `replacer: ${util.inspect(replacer)}, space: ${util.inspect(
                  space,
                )}`
              );
            },
          };

          await writeJsonFile(filePath, { foo: 'bar 😄' }, { stringifier });

          expect(await fs.promises.readFile(filePath, 'utf8')).toBe(
            `{ foo: 'bar 😄' }\nreplacer: undefined, space: undefined`,
          );
        });
      });

      it('writes the given data to the given file as JSON (not reformatting it if "prettify" is false)', async () => {
        expect.assertions(1);

        await withinSandbox(async (sandbox) => {
          const filePath = path.join(sandbox.directoryPath, 'test.json');
          const stringifier = {
            stringify(
              json: any,
              replacer?:
                | ((this: any, key: string, value: any) => any)
                | (number | string)[]
                | null,
              space?: string,
            ) {
              return (
                `${util.inspect(json)}\n` +
                `replacer: ${util.inspect(replacer)}, space: ${util.inspect(
                  space,
                )}`
              );
            },
          };

          await writeJsonFile(
            filePath,
            { foo: 'bar 😄' },
            { stringifier, prettify: false },
          );

          expect(await fs.promises.readFile(filePath, 'utf8')).toBe(
            `{ foo: 'bar 😄' }\nreplacer: undefined, space: undefined`,
          );
        });
      });

      it('writes the given data to the given file as JSON (reformatting it if "prettify" is true)', async () => {
        expect.assertions(1);

        await withinSandbox(async (sandbox) => {
          const filePath = path.join(sandbox.directoryPath, 'test.json');
          const stringifier = {
            stringify(
              json: any,
              replacer?:
                | ((this: any, key: string, value: any) => any)
                | (number | string)[]
                | null,
              space?: string,
            ) {
              return (
                `${util.inspect(json)}\n` +
                `replacer: ${util.inspect(replacer)}, space: ${util.inspect(
                  space,
                )}`
              );
            },
          };

          await writeJsonFile(
            filePath,
            { foo: 'bar 😄' },
            { stringifier, prettify: true },
          );

          expect(await fs.promises.readFile(filePath, 'utf8')).toBe(
            `{ foo: 'bar 😄' }\nreplacer: null, space: '  '`,
          );
        });
      });

      it('re-throws a wrapped version of any error that occurs, assigning it the same code and giving it a stack', async () => {
        expect.assertions(1);

        await withinSandbox(async (sandbox) => {
          // Make sandbox root directory non-readable
          await fs.promises.chmod(sandbox.directoryPath, 0o600);
          const filePath = path.join(sandbox.directoryPath, 'test.json');
          const stringifier = {
            stringify(
              json: any,
              replacer?:
                | ((this: any, key: string, value: any) => any)
                | (number | string)[]
                | null,
              space?: string,
            ) {
              return (
                `${util.inspect(json)}\n` +
                `replacer: ${util.inspect(replacer)}, space: ${util.inspect(
                  space,
                )}`
              );
            },
          };

          await expect(
            writeJsonFile(filePath, { foo: 'bar 😄' }, { stringifier }),
          ).rejects.toThrow(
            expect.objectContaining({
              message: `Could not write JSON file '${filePath}'`,
              code: 'EACCES',
              stack: expect.any(String),
              cause: expect.objectContaining({
                code: 'EACCES',
              }),
            }),
          );
        });
      });
    });
  });

  describe('fileExists', () => {
    it('returns true if the given path refers to an existing file', async () => {
      expect.assertions(1);

      await withinSandbox(async (sandbox) => {
        const filePath = path.join(sandbox.directoryPath, 'test.file');
        await fs.promises.writeFile(filePath, 'some content');

        expect(await fileExists(filePath)).toBe(true);
      });
    });

    it('returns false if the given path refers to something that is not a file', async () => {
      expect.assertions(1);

      await withinSandbox(async (sandbox) => {
        const directoryPath = path.join(
          sandbox.directoryPath,
          'test-directory',
        );
        await fs.promises.mkdir(directoryPath);

        expect(await fileExists(directoryPath)).toBe(false);
      });
    });

    it('returns false if the given path does not refer to any existing entry', async () => {
      expect.assertions(1);

      await withinSandbox(async (sandbox) => {
        const filePath = path.join(sandbox.directoryPath, 'nonexistent-entry');

        expect(await fileExists(filePath)).toBe(false);
      });
    });

    it('re-throws a wrapped version of any error that occurs, assigning it the same code and giving it a stack', async () => {
      const entryPath = '/some/file';
      const error: any = new Error('oops');
      error.code = 'ESOMETHING';
      error.stack = 'some stack';
      when(jest.spyOn(fs.promises, 'stat'))
        .calledWith(entryPath)
        .mockRejectedValue(error);

      await expect(fileExists(entryPath)).rejects.toThrow(
        expect.objectContaining({
          message: `Could not determine if file exists '${entryPath}'`,
          code: 'ESOMETHING',
          stack: expect.any(String),
          cause: error,
        }),
      );
    });
  });

  describe('directoryExists', () => {
    it('returns true if the given path refers to an existing directory', async () => {
      expect.assertions(1);

      await withinSandbox(async (sandbox) => {
        const directoryPath = path.join(
          sandbox.directoryPath,
          'test-directory',
        );
        await fs.promises.mkdir(directoryPath);

        expect(await directoryExists(directoryPath)).toBe(true);
      });
    });

    it('returns false if the given path refers to something that is not a directory', async () => {
      expect.assertions(1);

      await withinSandbox(async (sandbox) => {
        const filePath = path.join(sandbox.directoryPath, 'test.file');
        await fs.promises.writeFile(filePath, 'some content');

        expect(await directoryExists(filePath)).toBe(false);
      });
    });

    it('returns false if the given path does not refer to any existing entry', async () => {
      expect.assertions(1);

      await withinSandbox(async (sandbox) => {
        const directoryPath = path.join(
          sandbox.directoryPath,
          'nonexistent-entry',
        );

        expect(await directoryExists(directoryPath)).toBe(false);
      });
    });

    it('re-throws a wrapped version of any error that occurs, assigning it the same code and giving it a stack', async () => {
      const entryPath = '/some/file';
      const error: any = new Error('oops');
      error.code = 'ESOMETHING';
      error.stack = 'some stack';
      when(jest.spyOn(fs.promises, 'stat'))
        .calledWith(entryPath)
        .mockRejectedValue(error);

      await expect(directoryExists(entryPath)).rejects.toThrow(
        expect.objectContaining({
          message: `Could not determine if directory exists '${entryPath}'`,
          cause: error,
          stack: expect.any(String),
        }),
      );
    });
  });

  describe('ensureDirectoryStructureExists', () => {
    it('creates directories leading up to and including the given path', async () => {
      expect.assertions(3);

      await withinSandbox(async (sandbox) => {
        const directoryPath = path.join(sandbox.directoryPath, 'a', 'b', 'c');

        await ensureDirectoryStructureExists(directoryPath);

        // None of the `await`s below should throw.
        expect(
          await fs.promises.readdir(path.join(sandbox.directoryPath, 'a')),
        ).toStrictEqual(expect.anything());
        expect(
          await fs.promises.readdir(path.join(sandbox.directoryPath, 'a', 'b')),
        ).toStrictEqual(expect.anything());
        expect(
          await fs.promises.readdir(
            path.join(sandbox.directoryPath, 'a', 'b', 'c'),
          ),
        ).toStrictEqual(expect.anything());
      });
    });

    it('does not throw an error, returning undefined, if the given directory already exists', async () => {
      expect.assertions(1);

      await withinSandbox(async (sandbox) => {
        const directoryPath = path.join(sandbox.directoryPath, 'a', 'b', 'c');
        await fs.promises.mkdir(path.join(sandbox.directoryPath, 'a'));
        await fs.promises.mkdir(path.join(sandbox.directoryPath, 'a', 'b'));
        await fs.promises.mkdir(
          path.join(sandbox.directoryPath, 'a', 'b', 'c'),
        );

        expect(
          await ensureDirectoryStructureExists(directoryPath),
        ).toBeUndefined();
      });
    });

    it('re-throws a wrapped version of any error that occurs, assigning it the same code and giving it a stack', async () => {
      expect.assertions(1);

      await withinSandbox(async (sandbox) => {
        // Make sandbox root directory non-readable
        await fs.promises.chmod(sandbox.directoryPath, 0o600);
        const directoryPath = path.join(
          sandbox.directoryPath,
          'test-directory',
        );

        await expect(
          ensureDirectoryStructureExists(directoryPath),
        ).rejects.toThrow(
          expect.objectContaining({
            message: `Could not create directory structure '${directoryPath}'`,
            code: 'EACCES',
            stack: expect.any(String),
            cause: expect.objectContaining({
              code: 'EACCES',
            }),
          }),
        );
      });
    });
  });

  describe('forceRemove', () => {
    describe('given a file path', () => {
      it('removes the file', async () => {
        expect.assertions(1);

        await withinSandbox(async (sandbox) => {
          const filePath = path.join(sandbox.directoryPath, 'test.file');
          await fs.promises.writeFile(filePath, 'some content');

          expect(await forceRemove(filePath)).toBeUndefined();
        });
      });

      it('does nothing if the path does not exist', async () => {
        expect.assertions(1);

        await withinSandbox(async (sandbox) => {
          const filePath = path.join(sandbox.directoryPath, 'test.file');

          expect(await forceRemove(filePath)).toBeUndefined();
        });
      });

      it('re-throws a wrapped version of any error that occurs, assigning it the same code and giving it a stack', async () => {
        const filePath = '/some/file';
        const error: any = new Error('oops');
        error.code = 'ESOMETHING';
        error.stack = 'some stack';
        when(jest.spyOn(fs.promises, 'rm'))
          .calledWith(filePath, {
            recursive: true,
            force: true,
          })
          .mockRejectedValue(error);

        await expect(forceRemove(filePath)).rejects.toThrow(
          expect.objectContaining({
            message: `Could not remove file or directory '${filePath}'`,
            code: 'ESOMETHING',
            stack: expect.any(String),
            cause: error,
          }),
        );
      });
    });

    describe('given a directory path', () => {
      it('removes the directory', async () => {
        expect.assertions(1);

        await withinSandbox(async (sandbox) => {
          const directoryPath = path.join(
            sandbox.directoryPath,
            'test-directory',
          );
          await fs.promises.mkdir(directoryPath);

          expect(await forceRemove(directoryPath)).toBeUndefined();
        });
      });

      it('does nothing if the path does not exist', async () => {
        expect.assertions(1);

        await withinSandbox(async (sandbox) => {
          const directoryPath = path.join(
            sandbox.directoryPath,
            'test-directory',
          );

          expect(await forceRemove(directoryPath)).toBeUndefined();
        });
      });

      it('re-throws a wrapped version of any error that occurs, assigning it the same code and giving it a stack', async () => {
        const directoryPath = '/some/directory';
        const error: any = new Error('oops');
        error.code = 'ESOMETHING';
        error.stack = 'some stack';
        when(jest.spyOn(fs.promises, 'rm'))
          .calledWith(directoryPath, {
            recursive: true,
            force: true,
          })
          .mockRejectedValue(error);

        await expect(forceRemove(directoryPath)).rejects.toThrow(
          expect.objectContaining({
            message: `Could not remove file or directory '${directoryPath}'`,
            code: 'ESOMETHING',
            cause: error,
            stack: expect.any(String),
          }),
        );
      });
    });
  });

  describe('createSandbox', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('does not create the sandbox directory immediately', async () => {
      createSandbox('utils-fs');

      const sandboxDirectoryPath = path.join(os.tmpdir(), 'utils-fs');

      await expect(fs.promises.stat(sandboxDirectoryPath)).rejects.toThrow(
        'ENOENT',
      );
    });

    describe('withinSandbox', () => {
      it('creates the sandbox directory and keeps it around before its given function ends', async () => {
        expect.assertions(1);

        const nowTimestamp = new Date('2023-01-01').getTime();
        jest.setSystemTime(nowTimestamp);
        const { withinSandbox: withinTestSandbox } = createSandbox('utils-fs');
        const sandboxDirectoryPath = path.join(
          os.tmpdir(),
          `utils-fs--${nowTimestamp}`,
        );

        await withinTestSandbox(async () => {
          expect(await fs.promises.stat(sandboxDirectoryPath)).toStrictEqual(
            expect.anything(),
          );
        });
      });

      it('removes the sandbox directory after its given function ends', async () => {
        const nowTimestamp = new Date('2023-01-01').getTime();
        jest.setSystemTime(nowTimestamp);
        const { withinSandbox: withinTestSandbox } = createSandbox('utils-fs');
        const sandboxDirectoryPath = path.join(
          os.tmpdir(),
          `utils-fs--${nowTimestamp}`,
        );

        await withinTestSandbox(async () => {
          // do nothing
        });

        await expect(fs.promises.stat(sandboxDirectoryPath)).rejects.toThrow(
          'ENOENT',
        );
      });

      it('throws if the sandbox directory already exists', async () => {
        const nowTimestamp = new Date('2023-01-01').getTime();
        jest.setSystemTime(nowTimestamp);
        const { withinSandbox: withinTestSandbox } = createSandbox('utils-fs');
        const sandboxDirectoryPath = path.join(
          os.tmpdir(),
          `utils-fs--${nowTimestamp}`,
        );

        try {
          await fs.promises.mkdir(sandboxDirectoryPath);

          await expect(
            withinTestSandbox(async (_sandbox) => {
              // do nothing
            }),
          ).rejects.toThrow(
            `${sandboxDirectoryPath} already exists. Cannot continue.`,
          );
        } finally {
          await fs.promises.rm(sandboxDirectoryPath, { recursive: true });
        }
      });
    });
  });
});
