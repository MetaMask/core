import { isVersionInBounds } from './isVersionInBounds';

describe('isVersionInBounds', () => {
  const version = '7.57.0';

  const minimumVersionSchema = [
    {
      testName: 'returns true when current version is above minimum',
      minVersion: '7.56.0',
      currentVersion: version,
      expected: true,
    },
    {
      testName: 'returns false when current version equals minimum',
      minVersion: '7.57.0',
      currentVersion: version,
      expected: false,
    },
    {
      testName: 'returns false when current version is below minimum',
      minVersion: '7.58.0',
      currentVersion: version,
      expected: false,
    },
    {
      testName: 'returns true when no minimum version is specified',
      minVersion: undefined,
      currentVersion: version,
      expected: true,
    },
    {
      testName: 'returns true when no current version is provided',
      minVersion: '7.56.0',
      currentVersion: undefined,
      expected: true,
    },
    {
      testName: 'returns false when minimum version is malformed',
      minVersion: 'invalid-version',
      currentVersion: version,
      expected: false,
    },
  ];

  it.each(minimumVersionSchema)(
    'minimum version test - $testName',
    ({ minVersion, currentVersion, expected }) => {
      const result = isVersionInBounds({
        currentVersion,
        minVersion,
      });
      expect(result).toBe(expected);
    },
  );

  const maximumVersionSchema = [
    {
      testName: 'returns true when current version is below maximum',
      maxVersion: '7.58.0',
      currentVersion: version,
      expected: true,
    },
    {
      testName: 'returns false when current version equals maximum',
      maxVersion: '7.57.0',
      currentVersion: version,
      expected: false,
    },
    {
      testName: 'returns false when current version is above maximum',
      maxVersion: '7.56.0',
      currentVersion: version,
      expected: false,
    },
    {
      testName: 'returns true when no maximum version is specified',
      maxVersion: undefined,
      currentVersion: version,
      expected: true,
    },
    {
      testName: 'returns true when no current version is provided',
      maxVersion: '7.58.0',
      currentVersion: undefined,
      expected: true,
    },
    {
      testName: 'returns false when maximum version is malformed',
      maxVersion: 'invalid-version',
      currentVersion: version,
      expected: false,
    },
  ];

  it.each(maximumVersionSchema)(
    'maximum version test - $testName',
    ({ maxVersion, currentVersion, expected }) => {
      const result = isVersionInBounds({
        currentVersion,
        maxVersion,
      });
      expect(result).toBe(expected);
    },
  );

  const minMaxVersionSchema = [
    {
      testName:
        'returns true when version is within both bounds (min < current < max)',
      minVersion: '7.56.0',
      maxVersion: '7.58.0',
      currentVersion: version,
      expected: true,
    },
    {
      testName: 'returns true when version is above minimum and below maximum',
      minVersion: '7.56.5',
      maxVersion: '7.57.5',
      currentVersion: version,
      expected: true,
    },
    {
      testName: 'returns false when version equals minimum bound',
      minVersion: '7.57.0',
      maxVersion: '7.58.0',
      currentVersion: version,
      expected: false,
    },
    {
      testName: 'returns false when version equals maximum bound',
      minVersion: '7.56.0',
      maxVersion: '7.57.0',
      currentVersion: version,
      expected: false,
    },
    {
      testName: 'returns false when version is below minimum bound',
      minVersion: '7.58.0',
      maxVersion: '7.59.0',
      currentVersion: version,
      expected: false,
    },
    {
      testName: 'returns false when version is above maximum bound',
      minVersion: '7.55.0',
      maxVersion: '7.56.0',
      currentVersion: version,
      expected: false,
    },
    {
      testName: 'returns true when both bounds are undefined',
      minVersion: undefined,
      maxVersion: undefined,
      currentVersion: version,
      expected: true,
    },
    {
      testName:
        'returns true when only minimum is defined and version is above it',
      minVersion: '7.56.0',
      maxVersion: undefined,
      currentVersion: version,
      expected: true,
    },
    {
      testName:
        'returns true when only maximum is defined and version is below it',
      minVersion: undefined,
      maxVersion: '7.58.0',
      currentVersion: version,
      expected: true,
    },
    {
      testName:
        'returns true when no current version is provided regardless of bounds',
      minVersion: '7.56.0',
      maxVersion: '7.58.0',
      currentVersion: undefined,
      expected: true,
    },
    {
      testName:
        'returns false when minimum is malformed but maximum excludes current version',
      minVersion: 'malformed',
      maxVersion: '7.56.0',
      currentVersion: version,
      expected: false,
    },
    {
      testName:
        'returns false when maximum is malformed but minimum excludes current version',
      minVersion: '7.58.0',
      maxVersion: 'malformed',
      currentVersion: version,
      expected: false,
    },
  ];

  it.each(minMaxVersionSchema)(
    'min & max version bounds test - $testName',
    ({ minVersion, maxVersion, currentVersion, expected }) => {
      const result = isVersionInBounds({
        currentVersion,
        minVersion,
        maxVersion,
      });
      expect(result).toBe(expected);
    },
  );
});
