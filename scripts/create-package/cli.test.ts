import type { CommandModule } from 'yargs';

import cli from './cli';
import commands from './commands';
import * as utils from './utils';

jest.mock('./utils');

/**
 * A map of command names to command modules, as opposed to the array expected
 * by yargs.
 */
const commandMap = (commands as CommandModule[]).reduce<
  Record<string, CommandModule>
>((map, commandModule) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  map[commandModule.command! as string] = commandModule;
  return map;
}, {});

/**
 * Returns a mock `process.argv` array with the provided arguments. Includes
 * default values for `process.argv[0]` and `process.argv[1]`.
 *
 * @param args - The arguments to include in the mock argv array.
 * @returns The mock argv array.
 */
function getMockArgv(...args: string[]) {
  return ['/mock/path', '/mock/entry/path', ...args];
}

/**
 * Returns the parsed `yargs.Arguments` object for a given command, name, and
 * description.
 *
 * @param command - The command.
 * @param name - The name.
 * @param description - The description.
 * @returns The parsed argv object.
 */
function getParsedArgv(command: string, name: string, description: string) {
  return {
    _: [command],
    $0: 'create-package',
    name: `@metamask/${name}`,
    description,
  };
}

describe('create-package/cli', () => {
  beforeEach(async () => {
    // yargs calls process.exit(1) on failure. We have to intercept it.
    jest.spyOn(process, 'exit').mockImplementationOnce((code?: number) => {
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

  it('should display help if requested', async () => {
    expect(await cli(getMockArgv('help'), commands)).toBeUndefined();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/^create-package <cmd> \[args\]/u),
    );
  });

  it('should error if no command is specified', async () => {
    await expect(cli(getMockArgv(), commands)).rejects.toThrow('exit: 1');

    expect(console.error).toHaveBeenCalledWith(
      'You must specify a command. See --help.',
    );
  });

  it('should error if more than one command is specified', async () => {
    await expect(cli(getMockArgv('foo', 'bar'), commands)).rejects.toThrow(
      'exit: 1',
    );

    expect(console.error).toHaveBeenCalledWith(
      'You may not specify more than one command. See --help.',
    );
  });

  it('should error if a string option contains only whitespace', async () => {
    const newCommand = commandMap.new;
    jest.spyOn(newCommand, 'handler').mockImplementation();

    await expect(
      cli(getMockArgv('new', '--name', '  '), commands),
    ).rejects.toThrow('exit: 1');

    expect(console.error).toHaveBeenCalledWith(
      'The argument "name" was processed to an empty string. Please provide a value with non-whitespace characters.',
    );
  });

  describe('command: new', () => {
    it('should call the command handler with the correct arguments', async () => {
      const newCommand = commandMap.new;
      jest.spyOn(newCommand, 'handler');

      jest.spyOn(utils, 'readMonorepoFiles').mockResolvedValue({
        tsConfig: {},
        tsConfigBuild: {},
        nodeVersion: '20.0.0',
      } as any);
      jest.spyOn(utils, 'finalizeAndWriteData').mockResolvedValue();

      expect(
        await cli(
          getMockArgv('new', '--name', 'foo', '--description', 'bar'),
          commands,
        ),
      ).toBeUndefined();

      expect(newCommand.handler).toHaveBeenCalledTimes(1);
      expect(newCommand.handler).toHaveBeenCalledWith(
        expect.objectContaining(getParsedArgv('new', 'foo', 'bar')),
      );
    });

    it('should create a new package', async () => {
      const newCommand = commandMap.new;
      jest.spyOn(newCommand, 'handler').mockImplementation();

      expect(
        await cli(
          getMockArgv('new', '--name', 'foo', '--description', 'bar'),
          commands,
        ),
      ).toBeUndefined();

      expect(newCommand.handler).toHaveBeenCalledTimes(1);
      expect(newCommand.handler).toHaveBeenCalledWith(
        expect.objectContaining(getParsedArgv('new', 'foo', 'bar')),
      );
    });
  });
});
