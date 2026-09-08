import type { CapacitorConfig } from '@capacitor/cli';

const devServerUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.agendarecap.app',
  appName: 'AgendaRecap Pro',
  webDir: 'out',
  server: devServerUrl ? {
    url: devServerUrl,
    cleartext: true,
  } : {
    androidScheme: 'https',
    allowNavigation: [
      '*.supabase.co'
    ]
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#3B82F6',
      sound: 'beep.wav',
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
