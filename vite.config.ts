import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const isElectron = process.env.ELECTRON === '1'

export default defineConfig(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plugins: any[] = [react(), tailwindcss()]

  if (isElectron) {
    const { default: electron } = await import('vite-plugin-electron/simple')
    plugins.push(
      electron({
        main: {
          entry: 'electron/main.ts',
        },
        preload: {
          input: 'electron/preload.ts',
        },
      }),
    )
  }

  return {
    base: isElectron ? './' : '',
    plugins,
  }
})
