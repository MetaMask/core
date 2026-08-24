import { jest } from '@jest/globals';

// `jest.mock` does not apply to ES modules, so the module registry is stubbed
// with `jest.unstable_mockModule` and the modules under test are imported
// dynamically afterwards.
jest.unstable_mockModule('./utils.js', () => ({
  readMonorepoFiles: jest.fn(),
  finalizeAndWriteData: jest.fn(),
}));

// yargs' ESM shim captures `process.exit` by reference when it is loaded, so
// the spy has to be installed before `cli.js` pulls yargs in. Its
// implementation is re-armed in `beforeEach`, because `resetMocks` clears it
// between tests.
const exitSpy = jest.spyOn(process, 'exit');

const { default: cli } = await import('./cli.js');
const { commands, commandMap } = await import('./commands.js');
const utils = await import('./utils.js');

/**
 * Returns a mock `process.argv` array with the provided arguments. Includes
 * default values for `process.argv[0]` and `process.argv[1]`.
 *
 * @param args - The arguments to include in the mock argv array.
 * @returns The mock argv array.
 */
function getMockArgv(...args: string[]): string[] {
  return ['/mock/path', '/mock/entry/path', ...args];
}

/**
 * Returns the parsed `yargs.Arguments` object for a given package name and
 * description.
 *
 * @param name - The package name.
 * @param description - The package description.
 * @returns The parsed argv object.
 */
function getParsedArgv(
  name: string,
  description: string,
): {
  _: [];
  $0: 'create-package';
  name: `@metamask/${string}`;
  description: string;
} {
  return {
    _: [],
    $0: 'create-package',
    name: `@metamask/${name}`,
    description,
  };
}

describe('create-package/cli', () => {
  beforeEach(() => {
    // yargs calls process.exit() with 1 on failure and sometimes 0 on success.
    // We have to intercept it.
    exitSpy.mockImplementation((code) => {
      if (code === 1) {
        throw new Error('exit: 1');
      } else {
        return undefined as never;
      }
    });

    // We actually check these.
    jest.spyOn(console, 'error');
    jest.spyOn(console, 'log');
  });

  afterEach(() => {
    delete process.exitCode;
  });

  it('should error if a string option contains only whitespace', async () => {
    const defaultCommand = commandMap.$0;
    jest
      .spyOn(defaultCommand, 'handler')
      .mockImplementation(async () => undefined);

    await expect(cli(getMockArgv('--name', '  '), commands)).rejects.toThrow(
      'exit: 1',
    );

    expect(console.error).toHaveBeenCalledWith(
      'The argument "name" was processed to an empty string. Please provide a value with non-whitespace characters.',
    );
  });

  describe('command: $0', () => {
    it('should call the command handler with the correct arguments', async () => {
      const defaultCommand = commandMap.$0;
      jest.spyOn(defaultCommand, 'handler');

      jest.mocked(utils.readMonorepoFiles).mockResolvedValue({
        tsConfig: {},
        tsConfigBuild: {},
        nodeVersions: '>=18.0.0',
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      jest.mocked(utils.finalizeAndWriteData).mockResolvedValue();

      expect(
        await cli(
          getMockArgv('--name', 'foo', '--description', 'bar'),
          commands,
        ),
      ).toBeUndefined();

      expect(defaultCommand.handler).toHaveBeenCalledTimes(1);
      expect(defaultCommand.handler).toHaveBeenCalledWith(
        expect.objectContaining(getParsedArgv('foo', 'bar')),
      );
    });

    it('should handle names already prefixed with "@metamask/"', async () => {
      const defaultCommand = commandMap.$0;
      jest.spyOn(defaultCommand, 'handler');

      jest.mocked(utils.readMonorepoFiles).mockResolvedValue({
        tsConfig: {},
        tsConfigBuild: {},
        nodeVersions: '>=18.0.0',
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      jest.mocked(utils.finalizeAndWriteData).mockResolvedValue();

      expect(
        await cli(
          getMockArgv('--name', '@metamask/foo', '--description', 'bar'),
          commands,
        ),
      ).toBeUndefined();

      expect(defaultCommand.handler).toHaveBeenCalledTimes(1);
      expect(defaultCommand.handler).toHaveBeenCalledWith(
        expect.objectContaining(getParsedArgv('foo', 'bar')),
      );
    });

    it('should create a new package', async () => {
      const defaultCommand = commandMap.$0;
      jest
        .spyOn(defaultCommand, 'handler')
        .mockImplementation(async () => undefined);

      expect(
        await cli(
          getMockArgv('--name', 'foo', '--description', 'bar'),
          commands,
        ),
      ).toBeUndefined();

      expect(defaultCommand.handler).toHaveBeenCalledTimes(1);
      expect(defaultCommand.handler).toHaveBeenCalledWith(
        expect.objectContaining(getParsedArgv('foo', 'bar')),
      );
    });

    it('should error if the package name is missing', async () => {
      const defaultCommand = commandMap.$0;
      jest
        .spyOn(defaultCommand, 'handler')
        .mockImplementation(async () => undefined);

      await expect(
        cli(getMockArgv('--description', 'bar'), commands),
      ).rejects.toThrow('exit: 1');

      expect(console.error).toHaveBeenCalledWith(
        'Missing required argument: "name"',
      );
    });

    it('should error if the package description is missing', async () => {
      const defaultCommand = commandMap.$0;
      jest
        .spyOn(defaultCommand, 'handler')
        .mockImplementation(async () => undefined);

      await expect(cli(getMockArgv('--name', 'foo'), commands)).rejects.toThrow(
        'exit: 1',
      );

      expect(console.error).toHaveBeenCalledWith(
        'Missing required argument: "description"',
      );
    });
  });
});
