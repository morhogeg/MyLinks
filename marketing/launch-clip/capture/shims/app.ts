/** `firebase/app` for the capture build: nothing to connect to. */
export * from '@firebase/app';
export const initializeApp = () => ({ name: '[DEFAULT]', options: {}, automaticDataCollectionEnabled: false });
export const getApp = () => ({ name: '[DEFAULT]', options: {}, automaticDataCollectionEnabled: false });
export const getApps = () => [];
