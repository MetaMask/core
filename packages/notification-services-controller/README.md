# `@metamask/notification-services-controller`

A comprehensive controller that manages notification and push notification services in MetaMask. This controller handles various types of notifications including wallet notifications, feature announcements, and Snap notifications, with support for both web and mobile platforms.

## Features

- **Multiple Notification Types**:
  - Wallet Notifications: Transaction and account-related alerts
  - Feature Announcements: Updates about new MetaMask features
  - Snap Notifications: Custom notifications from Snaps
  - On-chain Notifications: Blockchain event notifications
- **Push Notification Support**: Firebase Cloud Messaging (FCM) integration
- **Cross-Platform**: Support for both web extension and mobile platforms
- **Authentication Integration**: Works with MetaMask's authentication system
- **State Management**: Persistent storage of notification preferences
- **Modular Architecture**: Separate controllers for notifications and push services
- **Type Safety**: Written in TypeScript with comprehensive type definitions
- **Platform-Specific Code**: Dedicated implementations for web and mobile
- **Mock Support**: Built-in mocks for testing and development

## Installation

```bash
yarn add @metamask/notification-services-controller
```

or

```bash
npm install @metamask/notification-services-controller
```

## Usage

This package uses subpath exports to minimize bundle size and keep modules isolated. Here are the main ways to use it:

### Basic Notification Services

```typescript
import { NotificationServicesController } from '@metamask/notification-services-controller/notification-services';

// Initialize the controller
const controller = new NotificationServicesController({
  messenger,
  env: {
    featureAnnouncements: {
      baseUrl: 'https://api.metamask.io/announcements',
      privacyPolicyUrl: 'https://metamask.io/privacy.html',
    },
    isPushIntegrated: true,
  },
});

// Initialize notifications
controller.init();

// Enable notifications
await controller.enableNotificationServices();

// Get notifications by type
const notifications = await controller.getNotificationsByType('wallet');

// Delete notifications
await controller.deleteNotificationsById([
  'notification-id-1',
  'notification-id-2',
]);

// Subscribe to notification updates
messenger.subscribe(
  'NotificationServicesController:notificationsListUpdated',
  (notifications) => {
    console.log('New notifications:', notifications);
  },
);
```

### Push Notification Services

```typescript
import { NotificationServicesPushController } from '@metamask/notification-services-controller/push-services';

// Initialize the push controller
const pushController = new NotificationServicesPushController({
  messenger,
  config: {
    platform: 'extension',
    isPushFeatureEnabled: true,
    getLocale: () => 'en',
    pushService: webPushService, // Your platform-specific push service
  },
  env: {
    apiKey: 'your-fcm-api-key',
    authDomain: 'your-auth-domain',
    projectId: 'your-project-id',
    // ... other Firebase config
  },
});

// Enable push notifications
await pushController.enablePushNotifications(['uuid1', 'uuid2']);

// Update notification triggers
await pushController.updateTriggerPushNotifications(['new-uuid1', 'new-uuid2']);

// Disable push notifications
await pushController.disablePushNotifications();

// Subscribe to new notifications
messenger.subscribe(
  'NotificationServicesPushController:onNewNotifications',
  (notification) => {
    console.log('New push notification:', notification);
  },
);
```

### Platform-Specific Implementation

```typescript
// For web platform
import { WebPushService } from '@metamask/notification-services-controller/push-services/web';

const webPushService = new WebPushService({
  serviceWorkerPath: '/firebase-messaging-sw.js',
  // ... other web-specific config
});
```

### Using Mocks for Testing

```typescript
import { createNotificationServicesMock } from '@metamask/notification-services-controller/notification-services/mocks';
import { createPushServicesMock } from '@metamask/notification-services-controller/push-services/mocks';

const mockNotificationServices = createNotificationServicesMock();
const mockPushServices = createPushServicesMock();
```

## State Management

The controllers maintain state with the following structures:

```typescript
interface NotificationServicesControllerState {
  metamaskNotificationsList: INotification[];
  isNotificationServicesEnabled: boolean;
  isLoading: boolean;
}

interface NotificationServicesPushControllerState {
  isPushEnabled: boolean;
  fcmToken: string;
  isUpdatingFCMToken: boolean;
}
```

## Error Handling

The controllers provide comprehensive error handling:

```typescript
try {
  await controller.enableNotificationServices();
} catch (error) {
  if (error.message.includes('User is not signed in')) {
    // Handle authentication error
  } else if (error.message.includes('Push notifications not supported')) {
    // Handle push notification support error
  }
}
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
