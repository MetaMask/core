import cli from './cli';

// Much of the functionality of the CLI is implemented in ./commands, so we
// end up testing a lot of that here. We mock it out so that we can use
// jest.spyOn() to mock out the handler functions where relevant.
jest.mock('./commands', () => {
  const actual = jest.requireActual('./commands');
  return {
    __esModule: true,
    ...actual,
  };
});

jest.mock('./utils');

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

/**
 * Gets the command module `handler` function for a given command.
 *
 * @param command - The command to get the handler for.
 * @returns The handler function for the given command.
 */
async function getCommandHandler(command: 'new' | 'default') {
  const { default: commands } = await import('./commands');

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const { handler } = commands.find(
    (commandModule) => commandModule.command === command,
  )!;

  return handler;
}

describe('create-package/cli', () => {
  beforeEach(async () => {
    // yargs sometimes calls process.exit() internally. We don't want that.
    jest.spyOn(process, 'exit').mockImplementation();

    // We actually check these.
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();

    const commands = await import('./commands');
    commands.default.forEach((command) => {
      jest.spyOn(command, 'handler').mockImplementation();
    });
  });

  afterEach(() => {
    delete process.exitCode;
  });

  it('should display help if requested', async () => {
    expect(await cli(getMockArgv('help'))).toBeUndefined();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/^create-package <cmd> \[args\]/u),
    );
  });

  it('should error if no command is specified', async () => {
    expect(await cli(getMockArgv())).toBeUndefined();

    expect(console.error).toHaveBeenCalledWith('You must specify a command.');
  });

  it('should error if a string option contains only whitespace', async () => {
    expect(await cli(getMockArgv('new', '--name', '  '))).toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(
      'The argument "name" was processed to an empty string. Please provide a value with non-whitespace characters.',
    );
  });

  describe('command: new', () => {
    it('should create a new package', async () => {
      const handler = await getCommandHandler('new');

      expect(
        await cli(getMockArgv('new', '--name', 'foo', '--description', 'bar')),
      ).toBeUndefined();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining(getParsedArgv('new', 'foo', 'bar')),
      );
    });
  });

  describe('command: default', () => {
    it('should create a new package with default values', async () => {
      const handler = await getCommandHandler('default');

      expect(await cli(getMockArgv('default'))).toBeUndefined();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining(
          getParsedArgv('default', 'new-package', 'A new MetaMask package.'),
        ),
      );
    });
  });
});
