import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.z1movies.app',
  appName: 'Z1 Movies',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: [
      'firebasestorage.googleapis.com',
      'storage.googleapis.com',
      '*.firebasestorage.app',
      '*.appspot.com',
      '*.run.app',
      'archive.org',
      '*.archive.org',
      'media.w3.org',
      'test-streams.mux.dev',
      '*'
    ]
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true
  }
};

export default config;
