import {
  SocialController,
  SocialRealtimeService,
  SocialService,
  socialServiceName,
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
});
