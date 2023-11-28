import type { CommandModule } from 'yargs';

import cli from './cli';
import * as commandModule from './commands';

jest.mock('./commands', () => {
  const actual = jest.requireActual('./commands');
  actual.default.forEach((command: CommandModule) => {
    // eslint-disable-next-line jest/prefer-spy-on
    command.handler = jest.fn();
  });

  return actual.default;
});

jest.mock('./utils');

const getMockArgv = (...args: string[]) => {
  return ['/mock/path', '/mock/entry/path', ...args];
};

const getParsedArgv = (command: string, name: string, description: string) => ({
  _: [command],
  $0: 'create-package',
  name: `@metamask/${name}`,
  description,
});

describe('create-package/cli', () => {
  beforeEach(() => {
    jest.resetAllMocks();

    // yargs sometimes calls process.exit() internally. We don't want that.
    jest.spyOn(process, 'exit').mockImplementation();

    // We actually check these.
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { handler } = commandModule.default.find(
      (command) => command.command === 'new',
    )!;

    it('should create a new package', async () => {
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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { handler } = commandModule.default.find(
      (command) => command.command === 'default',
    )!;

    it('should create a new package with default values', async () => {
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
