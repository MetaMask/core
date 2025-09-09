import { AccountActivityService, WebSocketService } from '.';

describe('Backend Platform Package', () => {
  it('exports AccountActivityService', () => {
    expect(AccountActivityService).toBeDefined();
    expect(typeof AccountActivityService).toBe('function');
  });

  it('exports WebSocketService', () => {
    expect(WebSocketService).toBeDefined();
    expect(typeof WebSocketService).toBe('function');
  });
});
