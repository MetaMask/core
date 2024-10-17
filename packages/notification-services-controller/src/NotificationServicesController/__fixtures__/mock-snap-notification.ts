import { TRIGGER_TYPES } from '../constants';
import { type RawSnapNotification } from '../types/snaps';

/**
 * Mocking Utility - create a mock raw feature announcement
 *
 * @returns Mock Raw Feature Announcement
 */
export function createMockSnapNotification(): RawSnapNotification {
  return {
    type: TRIGGER_TYPES.SNAP,
    data: {
      message: 'fooBar',
      origin: '@metamask/example-snap',
      detailedView: {
        title: 'Detailed View',
        interfaceId: '1',
        footerLink: {
          text: 'Go Home',
          href: 'metamask://client/',
        },
      },
    },
  };
}
