import cli from './cli';

jest.mock('./cli');

describe('main', () => {
  it('executes the CLI application', async () => {
    const mock = cli as jest.MockedFunction<typeof cli>;
    mock.mockRejectedValue('foo');

    jest.spyOn(console, 'error').mockImplementation();

    await import('.');

    expect(cli).toHaveBeenCalledTimes(1);
    expect(cli).toHaveBeenCalledWith(process.argv);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith('foo');
    expect(process.exitCode).toBe(1);
  });
});
