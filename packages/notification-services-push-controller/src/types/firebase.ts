export type PushNotificationEnv = {
  apiKey: string;
  authDomain: string;
  storageBucket: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
  vapidKey: string;
};

export type Messaging = {
  app: FirebaseApp;
};

export type FirebaseApp = {
  readonly name: string;
  readonly options: FirebaseOptions;
  automaticDataCollectionEnabled: boolean;
};

export type FirebaseOptions = {
  apiKey?: string;
  authDomain?: string;
  databaseURL?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
};

export type NotificationPayload = {
  title?: string;
  body?: string;
  image?: string;
  icon?: string;
};

export type FcmOptions = {
  link?: string;
  analyticsLabel?: string;
};

export type MessagePayload = {
  notification?: NotificationPayload;
  data?: { [key: string]: string };
  fcmOptions?: FcmOptions;
  from: string;
  collapseKey: string;
  messageId: string;
};

export type GetTokenOptions = {
  vapidKey?: string;
  serviceWorkerRegistration?: ServiceWorkerRegistration;
};
