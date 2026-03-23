import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { findSourcesWithExposedMethods, parseSourceFile } from './parse-source';

describe('parseSourceFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'parse-source-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('extracts controller info from a file with MESSENGER_EXPOSED_METHODS', async () => {
    const controllerFile = path.join(tmpDir, 'TestController.ts');
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

  it('returns null for a file without MESSENGER_EXPOSED_METHODS', async () => {
    const controllerFile = path.join(tmpDir, 'NoExposed.ts');
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

  it('returns null for a file with empty MESSENGER_EXPOSED_METHODS', async () => {
    const controllerFile = path.join(tmpDir, 'EmptyController.ts');
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

  it('handles array literals without as const', async () => {
    const controllerFile = path.join(tmpDir, 'PlainArrayController.ts');
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

  it('works with Service class names', async () => {
    const serviceFile = path.join(tmpDir, 'TestService.ts');
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

  it('extracts methods without JSDoc', async () => {
    const controllerFile = path.join(tmpDir, 'NoDocController.ts');
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

  it('handles inherited methods via type checker', async () => {
    // Create a tsconfig.json so the type checker can work
    await fs.promises.writeFile(
      path.join(tmpDir, 'tsconfig.json'),
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
      path.join(tmpDir, 'BaseController.ts'),
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

    const controllerFile = path.join(tmpDir, 'ChildController.ts');
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

  it('handles inherited methods without JSDoc', async () => {
    await fs.promises.writeFile(
      path.join(tmpDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'ES2020', module: 'commonjs', strict: true },
        include: ['./*.ts'],
      }),
      'utf8',
    );

    await fs.promises.writeFile(
      path.join(tmpDir, 'BaseNoDoc.ts'),
      `
export class BaseNoDoc {
  baseMethod() {
    return 'base';
  }
}
`,
      'utf8',
    );

    const controllerFile = path.join(tmpDir, 'ChildNoDocController.ts');
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

  it('handles exposed method not found in hierarchy', async () => {
    await fs.promises.writeFile(
      path.join(tmpDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'ES2020', module: 'commonjs', strict: true },
        include: ['./*.ts'],
      }),
      'utf8',
    );

    const controllerFile = path.join(tmpDir, 'MissingMethodController.ts');
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

  it('formats JSDoc with empty middle lines', async () => {
    const controllerFile = path.join(tmpDir, 'EmptyLineDocController.ts');
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

  it('extracts JSDoc with non-standard middle lines', async () => {
    const controllerFile = path.join(tmpDir, 'WeirdDocController.ts');
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

  it('handles inherited methods with malformed tsconfig', async () => {
    // Write an invalid tsconfig to trigger readConfigFile error
    await fs.promises.writeFile(
      path.join(tmpDir, 'tsconfig.json'),
      'this is not valid json',
      'utf8',
    );

    const controllerFile = path.join(tmpDir, 'BadTsconfigController.ts');
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

  it('handles inherited methods when tsconfig is missing', async () => {
    // No tsconfig.json in tmpDir — createProgramForFile should fail with assert
    const controllerFile = path.join(tmpDir, 'NoTsconfigController.ts');
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

  it('returns null and logs error for invalid file', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await parseSourceFile('/nonexistent/file.ts');

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

describe('findSourcesWithExposedMethods', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'find-controllers-'),
    );
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('finds controllers with MESSENGER_EXPOSED_METHODS in a directory', async () => {
    await fs.promises.writeFile(
      path.join(tmpDir, 'FooController.ts'),
      `
const MESSENGER_EXPOSED_METHODS = ['doFoo'] as const;
class FooController {
  doFoo() { return 'foo'; }
}
`,
      'utf8',
    );

    await fs.promises.writeFile(
      path.join(tmpDir, 'BarController.ts'),
      `
class BarController {
  doBar() { return 'bar'; }
}
`,
      'utf8',
    );

    const result = await findSourcesWithExposedMethods(tmpDir);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('FooController');
  });

  it('skips test files', async () => {
    await fs.promises.writeFile(
      path.join(tmpDir, 'FooController.test.ts'),
      `
const MESSENGER_EXPOSED_METHODS = ['doFoo'] as const;
class FooController {
  doFoo() { return 'foo'; }
}
`,
      'utf8',
    );

    const result = await findSourcesWithExposedMethods(tmpDir);

    expect(result).toHaveLength(0);
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

    await expect(findSourcesWithExposedMethods(tmpDir)).rejects.toThrow(
      'EACCES',
    );

    statSpy.mockRestore();
  });
});
