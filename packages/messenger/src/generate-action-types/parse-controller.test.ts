import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  findControllersWithExposedMethods,
  parseControllerFile,
} from './parse-controller';

describe('parseControllerFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'parse-controller-'),
    );
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

    const result = await parseControllerFile(controllerFile);

    expect(result).toStrictEqual({
      name: 'TestController',
      filePath: controllerFile,
      exposedMethods: ['doStuff'],
      methods: [
        {
          name: 'doStuff',
          jsDoc: '/**\n * Does stuff.\n */',
          signature: 'doStuff',
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

    const result = await parseControllerFile(controllerFile);

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

    const result = await parseControllerFile(controllerFile);

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

    const result = await parseControllerFile(controllerFile);

    expect(result).not.toBeNull();
    expect(result?.exposedMethods).toStrictEqual(['doStuff']);
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

    const result = await parseControllerFile(serviceFile);

    expect(result).not.toBeNull();
    expect(result?.name).toBe('TestService');
  });
});

describe('findControllersWithExposedMethods', () => {
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

    const result = await findControllersWithExposedMethods(tmpDir);

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

    const result = await findControllersWithExposedMethods(tmpDir);

    expect(result).toHaveLength(0);
  });

  it('throws an error when the path is not a directory', async () => {
    await expect(
      findControllersWithExposedMethods('/nonexistent/path'),
    ).rejects.toThrow('The specified path is not a directory');
  });
});
