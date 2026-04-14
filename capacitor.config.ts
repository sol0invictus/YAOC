import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.yaoa.notes',
  appName: 'YAOA Notes',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
