import debug, { Debugger } from 'debug';

const globalLogger = debug('metamask');

/**
 * Creates a logger via the `debug` library whose log messages will be tagged
 * using the name of your project. By default, such messages will be
 * suppressed, but you can reveal them by setting the `DEBUG` environment
 * variable to `metamask:<projectName>`. You can also set this variable to
 * `metamask:*` if you want to see log messages from all MetaMask projects that
 * are also using this function to create their loggers.
 *
 * @param projectName - The name of your project. This should be the name of
 * your NPM package if you're developing one.
 * @returns An instance of `debug`.
 */
export function createProjectLogger(projectName: string): Debugger {
  return globalLogger.extend(projectName);
}

/**
 * Creates a logger via the `debug` library which is derived from the logger for
 * the whole project whose log messages will be tagged using the name of your
 * module. By default, such messages will be suppressed, but you can reveal them
 * by setting the `DEBUG` environment variable to
 * `metamask:<projectName>:<moduleName>`. You can also set this variable to
 * `metamask:<projectName>:*` if you want to see log messages from the project,
 * or `metamask:*` if you want to see log messages from all MetaMask projects.
 *
 * @param projectLogger - The logger created via {@link createProjectLogger}.
 * @param moduleName - The name of your module. You could use the name of the
 * file where you're using this logger or some other name.
 * @returns An instance of `debug`.
 */
export function createModuleLogger(
  projectLogger: Debugger,
  moduleName: string,
): Debugger {
  return projectLogger.extend(moduleName);
}
