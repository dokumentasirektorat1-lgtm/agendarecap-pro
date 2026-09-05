import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.agendarecap.app',
  appName: 'AgendaRecap Pro',
  webDir: 'public',
  server: {
    url: 'https://agendarecap.vercel.app',
    cleartext: true,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#3B82F6',
      sound: 'beep.wav',
    },
  },
};

export default config;
