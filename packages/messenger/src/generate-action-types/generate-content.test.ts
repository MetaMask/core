import { generateActionTypesContent } from './generate-content';
import type { SourceInfo } from './parse-source';

describe('generateActionTypesContent', () => {
  it('generates action types for a controller with one method', () => {
    const controller: SourceInfo = {
      name: 'FooController',
      filePath: '/some/path/FooController.ts',

      methods: [
        {
          name: 'doSomething',
          jsDoc: '',
          signature: 'doSomething',
        },
      ],
    };

    const result = generateActionTypesContent(controller);

    expect(result).toContain('This file is auto generated.');
    expect(result).toContain(
      "import type { FooController } from './FooController';",
    );
    expect(result).toContain('export type FooControllerDoSomethingAction = {');
    expect(result).toContain('type: `FooController:doSomething`;');
    expect(result).toContain("handler: FooController['doSomething'];");
    expect(result).toContain(
      'export type FooControllerMethodActions = FooControllerDoSomethingAction;',
    );
  });

  it('generates action types for a controller with multiple methods', () => {
    const controller: SourceInfo = {
      name: 'BarController',
      filePath: '/some/path/BarController.ts',

      methods: [
        { name: 'methodA', jsDoc: '' },
        { name: 'methodB', jsDoc: '' },
      ],
    };

    const result = generateActionTypesContent(controller);

    expect(result).toContain('export type BarControllerMethodAAction = {');
    expect(result).toContain('export type BarControllerMethodBAction = {');
    expect(result).toContain(
      'export type BarControllerMethodActions = BarControllerMethodAAction | BarControllerMethodBAction;',
    );
  });

  it('includes JSDoc comments when present', () => {
    const controller: SourceInfo = {
      name: 'FooController',
      filePath: '/some/path/FooController.ts',

      methods: [
        {
          name: 'doSomething',
          jsDoc: '/**\n * Does something.\n */',
          signature: 'doSomething',
        },
      ],
    };

    const result = generateActionTypesContent(controller);

    expect(result).toContain('/**\n * Does something.\n */');
  });

  it('generates no union type for controllers with no methods', () => {
    const controller: SourceInfo = {
      name: 'EmptyController',
      filePath: '/some/path/EmptyController.ts',

      methods: [],
    };

    const result = generateActionTypesContent(controller);

    expect(result).not.toContain('EmptyControllerMethodActions');
  });
});
