import { describe, expect, it } from 'vitest';

import {
  SocialController,
  SocialRealtimeService,
  SocialService,
  socialServiceName,
  UNSUPPORTED_TOKEN_POSITION_FLAG,
} from './index.js';

describe('social-controllers exports', () => {
  it('exports SocialController class', () => {
    expect(SocialController).toBeDefined();
  });

  it('exports SocialService class', () => {
    expect(SocialService).toBeDefined();
  });

  it('exports SocialRealtimeService class', () => {
    expect(SocialRealtimeService).toBeDefined();
  });

  it('exports serviceName', () => {
    expect(socialServiceName).toBe('SocialService');
  });

  it('exports the unsupported-token position flag', () => {
    expect(UNSUPPORTED_TOKEN_POSITION_FLAG).toBe('unsupported-token');
  });
});
