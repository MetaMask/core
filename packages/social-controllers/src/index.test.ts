import {
  SocialController,
  SocialService,
  socialControllerName,
  socialServiceName,
} from '.';

describe('social-controllers exports', () => {
  it('exports SocialController class', () => {
    expect(SocialController).toBeDefined();
  });

  it('exports SocialService class', () => {
    expect(SocialService).toBeDefined();
  });

  it('exports controllerName', () => {
    expect(socialControllerName).toBe('SocialController');
  });

  it('exports serviceName', () => {
    expect(socialServiceName).toBe('SocialService');
  });
});
