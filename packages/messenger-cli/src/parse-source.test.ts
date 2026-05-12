import { createSandbox } from '@metamask/utils/node';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { findSourcesWithExposedMethods, parseSourceFile } from './parse-source';

const { withinSandbox: withinParseSourceSandbox } = createSandbox(
  'messenger/parse-source',
);
const { withinSandbox: withinFindControllersSandbox } = createSandbox(
  'messenger/find-controllers',
);

describe('parseSourceFile', () => {
  it('extracts controller info from a file with MESSENGER_EXPOSED_METHODS', async () => {
    expect.assertions(1);

    await withinParseSourceSandbox(async ({ directoryPath }) => {
      const controllerFile = path.join(directoryPath, 'TestController.ts');
      await fs.promises.writeFile(
        controllerFile,
        `
const MESSENGER_EXPOSED_METHODS = ['doStuff'] as const;

class TestController {
  /**
   * Does stuff.
   */
  doStuff() {
    return true;
  }
}
`,
        'utf8',
      );

      const result = await parseSourceFile(controllerFile);

      expect(result).toStrictEqual({
        name: 'TestController',
        filePath: controllerFile,
        methods: [
          {
            name: 'doStuff',
            jsDoc: '/**\n * Does stuff.\n */',
          },
        ],
      });
    });
  });

  it('returns null for a file without MESSENGER_EXPOSED_METHODS', async () => {
    expect.assertions(1);

    await withinParseSourceSandbox(async ({ directoryPath }) => {
      const controllerFile = path.join(directoryPath, 'NoExposed.ts');
      await fs.promises.writeFile(
        controllerFile,
        `
class NoExposedController {
  doStuff() {
    return true;
  }
}
`,
        'utf8',
      );

      const result = await parseSourceFile(controllerFile);

      expect(result).toBeNull();
    });
  });

  it('returns null for a file with empty MESSENGER_EXPOSED_METHODS', async () => {
    expect.assertions(1);

    await withinParseSourceSandbox(async ({ directoryPath }) => {
      const controllerFile = path.join(directoryPath, 'EmptyController.ts');
      await fs.promises.writeFile(
        controllerFile,
        `
const MESSENGER_EXPOSED_METHODS = [] as const;

class EmptyController {
  doStuff() {
    return true;
  }
}
`,
        'utf8',
      );

      const result = await parseSourceFile(controllerFile);

      expect(result).toBeNull();
    });
  });

  it('handles array literals without as const', async () => {
    expect.assertions(2);

    await withinParseSourceSandbox(async ({ directoryPath }) => {
      const controllerFile = path.join(
        directoryPath,
        'PlainArrayController.ts',
      );
      await fs.promises.writeFile(
        controllerFile,
        `
const MESSENGER_EXPOSED_METHODS = ['doStuff'];

class PlainArrayController {
  doStuff() {
    return true;
  }
}
`,
        'utf8',
      );

      const result = await parseSourceFile(controllerFile);

      expect(result).not.toBeNull();
      expect(result?.methods.map((method) => method.name)).toStrictEqual([
        'doStuff',
      ]);
    });
  });

  it('works with Service class names', async () => {
    expect.assertions(2);

    await withinParseSourceSandbox(async ({ directoryPath }) => {
      const serviceFile = path.join(directoryPath, 'TestService.ts');
      await fs.promises.writeFile(
        serviceFile,
        `
const MESSENGER_EXPOSED_METHODS = ['fetchData'] as const;

class TestService {
  fetchData() {
    return [];
  }
}
`,
        'utf8',
      );

      const result = await parseSourceFile(serviceFile);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('TestService');
    });
  });

  it('extracts methods without JSDoc', async () => {
    expect.assertions(2);

    await withinParseSourceSandbox(async ({ directoryPath }) => {
      const controllerFile = path.join(directoryPath, 'NoDocController.ts');
      await fs.promises.writeFile(
        controllerFile,
        `
const MESSENGER_EXPOSED_METHODS = ['doStuff'] as const;

class NoDocController {
  doStuff() {
    return true;
  }
}
`,
        'utf8',
      );

      const result = await parseSourceFile(controllerFile);

      expect(result).not.toBeNull();
      expect(result?.methods[0].jsDoc).toBe('');
    });
  });

  it('handles inherited methods via type checker', async () => {
    expect.assertions(5);

    await withinParseSourceSandbox(async ({ directoryPath }) => {
      // Create a tsconfig.json so the type checker can work
      await fs.promises.writeFile(
        path.join(directoryPath, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2020',
            module: 'commonjs',
            strict: true,
          },
          include: ['./*.ts'],
        }),
        'utf8',
      );

      await fs.promises.writeFile(
        path.join(directoryPath, 'BaseController.ts'),
        `
export class BaseController {
  /**
   * Base method.
   */
  baseMethod() {
    return 'base';
  }
}
`,
        'utf8',
      );

      const controllerFile = path.join(directoryPath, 'ChildController.ts');
      await fs.promises.writeFile(
        controllerFile,
        `
import { BaseController } from './BaseController';

const MESSENGER_EXPOSED_METHODS = ['doStuff', 'baseMethod'] as const;

class ChildController extends BaseController {
  doStuff() {
    return true;
  }
}
`,
        'utf8',
      );

      const result = await parseSourceFile(controllerFile);

      expect(result).not.toBeNull();
      expect(result?.methods).toHaveLength(2);
      expect(result?.methods[0].name).toBe('doStuff');
      expect(result?.methods[1].name).toBe('baseMethod');
      expect(result?.methods[1].jsDoc).toContain('Base method.');
    });
  });

  it('handles inherited methods without JSDoc', async () => {
    expect.assertions(4);

    await withinParseSourceSandbox(async ({ directoryPath }) => {
      await fs.promises.writeFile(
        path.join(directoryPath, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2020',
            module: 'commonjs',
            strict: true,
          },
          include: ['./*.ts'],
        }),
        'utf8',
      );

      await fs.promises.writeFile(
        path.join(directoryPath, 'BaseNoDoc.ts'),
        `
export class BaseNoDoc {
  baseMethod() {
    return 'base';
  }
}
`,
        'utf8',
      );

      const controllerFile = path.join(
        directoryPath,
        'ChildNoDocController.ts',
      );
      await fs.promises.writeFile(
        controllerFile,
        `
import { BaseNoDoc } from './BaseNoDoc';

const MESSENGER_EXPOSED_METHODS = ['doStuff', 'baseMethod'] as const;

class ChildNoDocController extends BaseNoDoc {
  doStuff() {
    return true;
  }
}
`,
        'utf8',
      );

      const result = await parseSourceFile(controllerFile);

      expect(result).not.toBeNull();
      expect(result?.methods).toHaveLength(2);
      expect(result?.methods[1].name).toBe('baseMethod');
      // Method without JSDoc should have empty string
      expect(result?.methods[1].jsDoc).toBe('');
    });
  });

  it('handles exposed method not found in hierarchy', async () => {
    expect.assertions(4);

    await withinParseSourceSandbox(async ({ directoryPath }) => {
      await fs.promises.writeFile(
        path.join(directoryPath, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2020',
            module: 'commonjs',
            strict: true,
          },
          include: ['./*.ts'],
        }),
        'utf8',
      );

      const controllerFile = path.join(
        directoryPath,
        'MissingMethodController.ts',
      );
      await fs.promises.writeFile(
        controllerFile,
        `
const MESSENGER_EXPOSED_METHODS = ['doStuff', 'nonExistentMethod'] as const;

class MissingMethodController {
  doStuff() {
    return true;
  }
}
`,
        'utf8',
      );

      const result = await parseSourceFile(controllerFile);

      expect(result).not.toBeNull();
      expect(result?.methods).toHaveLength(2);
      expect(result?.methods[1].name).toBe('nonExistentMethod');
      expect(result?.methods[1].jsDoc).toBe('');
    });
  });

  it('formats JSDoc with empty middle lines', async () => {
    expect.assertions(4);

    await withinParseSourceSandbox(async ({ directoryPath }) => {
      const controllerFile = path.join(
        directoryPath,
        'EmptyLineDocController.ts',
      );
      await fs.promises.writeFile(
        controllerFile,
        `
const MESSENGER_EXPOSED_METHODS = ['doStuff'] as const;

class EmptyLineDocController {
  /**
   * First line.
   *
   * After empty line.
   */
  doStuff() {
    return true;
  }
}
`,
        'utf8',
      );

      const result = await parseSourceFile(controllerFile);

      expect(result).not.toBeNull();
      expect(result?.methods[0].jsDoc).toContain(' *\n');
      expect(result?.methods[0].jsDoc).toContain(' * First line.');
      expect(result?.methods[0].jsDoc).toContain(' * After empty line.');
    });
  });

  it('extracts JSDoc with non-standard middle lines', async () => {
    expect.assertions(3);

    await withinParseSourceSandbox(async ({ directoryPath }) => {
      const controllerFile = path.join(directoryPath, 'WeirdDocController.ts');
      // Write file with a JSDoc containing a line without * prefix and an empty line without * prefix
      const source = [
        '',
        "const MESSENGER_EXPOSED_METHODS = ['doStuff'] as const;",
        '',
        'class WeirdDocController {',
        '  /**',
        '    This line has no asterisk prefix.',
        '    ',
        '   */',
        '  doStuff() {',
        '    return true;',
        '  }',
        '}',
        '',
      ].join('\n');
      await fs.promises.writeFile(controllerFile, source, 'utf8');

      const result = await parseSourceFile(controllerFile);

      expect(result).not.toBeNull();
      expect(result?.methods[0].jsDoc).toContain(
        ' * This line has no asterisk prefix.',
      );
      // The empty line (only whitespace, no *) should become ' *'
      expect(result?.methods[0].jsDoc).toContain(' *\n');
    });
  });

  it('handles inherited methods with malformed tsconfig', async () => {
    expect.assertions(2);

    await withinParseSourceSandbox(async ({ directoryPath }) => {
      // Write an invalid tsconfig to trigger readConfigFile error
      await fs.promises.writeFile(
        path.join(directoryPath, 'tsconfig.json'),
        'this is not valid json',
        'utf8',
      );

      const controllerFile = path.join(
        directoryPath,
        'BadTsconfigController.ts',
      );
      await fs.promises.writeFile(
        controllerFile,
        `
const MESSENGER_EXPOSED_METHODS = ['doStuff', 'inherited'] as const;

class BadTsconfigController {
  doStuff() {
    return true;
  }
}
`,
        'utf8',
      );

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = await parseSourceFile(controllerFile);

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  it('handles inherited methods when tsconfig is missing', async () => {
    expect.assertions(2);

    await withinParseSourceSandbox(async ({ directoryPath }) => {
      // No tsconfig.json in directoryPath — createProgramForFile should fail with assert
      const controllerFile = path.join(
        directoryPath,
        'NoTsconfigController.ts',
      );
      await fs.promises.writeFile(
        controllerFile,
        `
const MESSENGER_EXPOSED_METHODS = ['doStuff', 'inheritedMethod'] as const;

class NoTsconfigController {
  doStuff() {
    return true;
  }
}
`,
        'utf8',
      );

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = await parseSourceFile(controllerFile);

      // Should return null because assert fails when type checker can't be created
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  it('returns null and logs error for invalid file', async () => {
    expect.assertions(2);

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await parseSourceFile('/nonexistent/file.ts');

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

describe('findSourcesWithExposedMethods', () => {
  it('finds controllers with MESSENGER_EXPOSED_METHODS in a directory', async () => {
    expect.assertions(2);

    await withinFindControllersSandbox(async ({ directoryPath }) => {
      await fs.promises.writeFile(
        path.join(directoryPath, 'FooController.ts'),
        `
const MESSENGER_EXPOSED_METHODS = ['doFoo'] as const;
class FooController {
  doFoo() { return 'foo'; }
}
`,
        'utf8',
      );

      await fs.promises.writeFile(
        path.join(directoryPath, 'BarController.ts'),
        `
class BarController {
  doBar() { return 'bar'; }
}
`,
        'utf8',
      );

      const result = await findSourcesWithExposedMethods(directoryPath);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('FooController');
    });
  });

  it('skips test files', async () => {
    expect.assertions(1);

    await withinFindControllersSandbox(async ({ directoryPath }) => {
      await fs.promises.writeFile(
        path.join(directoryPath, 'FooController.test.ts'),
        `
const MESSENGER_EXPOSED_METHODS = ['doFoo'] as const;
class FooController {
  doFoo() { return 'foo'; }
}
`,
        'utf8',
      );

      const result = await findSourcesWithExposedMethods(directoryPath);

      expect(result).toHaveLength(0);
    });
  });

  it('finds sources in nested subdirectories', async () => {
    expect.assertions(2);

    await withinFindControllersSandbox(async ({ directoryPath }) => {
      const subDir = path.join(directoryPath, 'nested');
      await fs.promises.mkdir(subDir);

      await fs.promises.writeFile(
        path.join(subDir, 'NestedController.ts'),
        `
const MESSENGER_EXPOSED_METHODS = ['doNested'] as const;
class NestedController {
  doNested() { return 'nested'; }
}
`,
        'utf8',
      );

      const result = await findSourcesWithExposedMethods(directoryPath);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('NestedController');
    });
  });

  it('skips excluded directories like node_modules', async () => {
    expect.assertions(1);

    await withinFindControllersSandbox(async ({ directoryPath }) => {
      const nodeModulesDir = path.join(directoryPath, 'node_modules');
      await fs.promises.mkdir(nodeModulesDir);

      await fs.promises.writeFile(
        path.join(nodeModulesDir, 'HiddenController.ts'),
        `
const MESSENGER_EXPOSED_METHODS = ['doHidden'] as const;
class HiddenController {
  doHidden() { return 'hidden'; }
}
`,
        'utf8',
      );

      const result = await findSourcesWithExposedMethods(directoryPath);

      expect(result).toHaveLength(0);
    });
  });

  it('throws an error when the path is not a directory', async () => {
    await expect(
      findSourcesWithExposedMethods('/nonexistent/path'),
    ).rejects.toThrow('The specified path is not a directory');
  });

  it('re-throws non-ENOENT errors from isDirectory', async () => {
    const statSpy = jest
      .spyOn(fs.promises, 'stat')
      .mockRejectedValue(
        Object.assign(new Error('EACCES'), { code: 'EACCES' }),
      );

    await expect(findSourcesWithExposedMethods('/some/path')).rejects.toThrow(
      'EACCES',
    );

    statSpy.mockRestore();
  });
});
