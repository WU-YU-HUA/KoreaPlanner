import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/KoreaPlanner/',
  plugins: [react()],
  // WSL does not reliably receive change events for files edited on Windows.
  server: {
    watch: { usePolling: Boolean(process.env.WSL_DISTRO_NAME), interval: 300 },
  },
  test: {
    environment: 'node',
  },
});
