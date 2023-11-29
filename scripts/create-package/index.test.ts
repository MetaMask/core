import cli from './cli';
import commands from './commands';

jest.mock('./cli');

describe('create-packages/index', () => {
  it('executes the CLI application', async () => {
    const mock = cli as jest.MockedFunction<typeof cli>;
    mock.mockRejectedValue('foo');

    jest.spyOn(console, 'error').mockImplementation();

    await import('.');

    expect(cli).toHaveBeenCalledTimes(1);
    expect(cli).toHaveBeenCalledWith(process.argv, commands);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith('foo');
    expect(process.exitCode).toBe(1);
  });
});
