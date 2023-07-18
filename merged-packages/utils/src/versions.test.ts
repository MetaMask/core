import {
  assertIsSemVerRange,
  assertIsSemVerVersion,
  gtRange,
  gtVersion,
  isValidSemVerRange,
  isValidSemVerVersion,
  satisfiesVersionRange,
  SemVerRange,
  SemVerVersion,
} from './versions';

describe('assertIsSemVerVersion', () => {
  it('shows descriptive errors', () => {
    expect(() => assertIsSemVerVersion('>1.2')).toThrow(
      'Expected SemVer version, got',
    );
  });
});

describe('assertIsSemVerRange', () => {
  it('shows descriptive errors', () => {
    expect(() => assertIsSemVerRange('.')).toThrow(
      'Expected SemVer range, got',
    );
  });
});

describe('isValidSemVerVersion', () => {
  it.each([
    'asd',
    '()()',
    '..',
    '.',
    '.1',
    null,
    undefined,
    2,
    true,
    {},
    Error,
  ])('rejects invalid version', (version) => {
    expect(isValidSemVerVersion(version)).toBe(false);
  });

  it('supports normal version ranges', () => {
    expect(isValidSemVerVersion('1.5.0')).toBe(true);
  });

  it('supports pre-release versions', () => {
    expect(isValidSemVerVersion('1.0.0-beta.1')).toBe(true);
  });
});

describe('isValidSemVerRange', () => {
  it('supports *', () => {
    expect(isValidSemVerRange('*')).toBe(true);
  });

  it('supports normal version ranges', () => {
    expect(isValidSemVerRange('^1.2.3')).toBe(true);
    expect(isValidSemVerRange('1.5.0')).toBe(true);
  });

  it('supports pre-release versions', () => {
    expect(isValidSemVerRange('1.0.0-beta.1')).toBe(true);
    expect(isValidSemVerRange('^1.0.0-beta.1')).toBe(true);
  });

  it('rejects non strings', () => {
    expect(isValidSemVerRange(null)).toBe(false);
    expect(isValidSemVerRange(undefined)).toBe(false);
    expect(isValidSemVerRange(2)).toBe(false);
    expect(isValidSemVerRange(true)).toBe(false);
    expect(isValidSemVerRange({})).toBe(false);
  });

  it.each(['asd', '()()(', '..', '.', '1.'])(
    'rejects invalid ranges',
    (range) => {
      expect(isValidSemVerRange(range)).toBe(false);
    },
  );
});

describe('gtVersion', () => {
  it('supports regular versions', () => {
    expect(gtVersion('1.2.3' as SemVerVersion, '1.0.0' as SemVerVersion)).toBe(
      true,
    );

    expect(gtVersion('2.0.0' as SemVerVersion, '1.0.0' as SemVerVersion)).toBe(
      true,
    );

    expect(gtVersion('1.0.0' as SemVerVersion, '1.2.3' as SemVerVersion)).toBe(
      false,
    );

    expect(gtVersion('1.0.0' as SemVerVersion, '2.0.0' as SemVerVersion)).toBe(
      false,
    );
  });

  it('supports pre-release versions', () => {
    expect(
      gtVersion(
        '1.0.0-beta.2' as SemVerVersion,
        '1.0.0-beta.1' as SemVerVersion,
      ),
    ).toBe(true);

    expect(
      gtVersion('1.0.0-beta.2' as SemVerVersion, '1.2.3' as SemVerVersion),
    ).toBe(false);

    expect(
      gtVersion('1.0.0' as SemVerVersion, '1.0.0-beta.2' as SemVerVersion),
    ).toBe(true);

    expect(
      gtVersion('1.2.3-beta.1' as SemVerVersion, '1.0.0' as SemVerVersion),
    ).toBe(true);

    expect(
      gtVersion(
        '1.2.3-beta.1' as SemVerVersion,
        '1.2.3-alpha.2' as SemVerVersion,
      ),
    ).toBe(true);
  });
});

describe('gtRange', () => {
  it('supports regular versions', () => {
    expect(gtRange('1.2.3' as SemVerVersion, '^1.0.0' as SemVerRange)).toBe(
      false,
    );

    expect(
      gtRange('2.0.0' as SemVerVersion, '>1.0.0 <2.0.0' as SemVerRange),
    ).toBe(true);

    expect(gtRange('1.2.0' as SemVerVersion, '~1.2.0' as SemVerRange)).toBe(
      false,
    );

    expect(gtRange('1.5.0' as SemVerVersion, '<1.5.0' as SemVerRange)).toBe(
      true,
    );
  });
});

describe('satisfiesVersionRange', () => {
  it('supports *', () => {
    expect(
      satisfiesVersionRange('3.0.0' as SemVerVersion, '*' as SemVerRange),
    ).toBe(true);
  });

  it('supports exact versions', () => {
    expect(
      satisfiesVersionRange(
        '1.0.0-beta.1' as SemVerVersion,
        '1.0.0-beta.1' as SemVerRange,
      ),
    ).toBe(true);

    expect(
      satisfiesVersionRange('1.0.0' as SemVerVersion, '1.0.0' as SemVerRange),
    ).toBe(true);

    expect(
      satisfiesVersionRange('1.2.3' as SemVerVersion, '1.0.0' as SemVerRange),
    ).toBe(false);
  });

  it('supports non-exact version ranges', () => {
    expect(
      satisfiesVersionRange('1.2.3' as SemVerVersion, '^1.0.0' as SemVerRange),
    ).toBe(true);

    expect(
      satisfiesVersionRange('2.0.0' as SemVerVersion, '^1.0.0' as SemVerRange),
    ).toBe(false);
  });

  it('pre-releases can satisfy version range', () => {
    expect(
      satisfiesVersionRange(
        '1.0.0-beta.1' as SemVerVersion,
        '*' as SemVerRange,
      ),
    ).toBe(true);

    expect(
      satisfiesVersionRange(
        '1.0.0-beta.1' as SemVerVersion,
        '^1.0.0' as SemVerRange,
      ),
    ).toBe(false);
  });
});
