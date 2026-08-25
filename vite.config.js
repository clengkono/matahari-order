import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { buildCustomerCatalog } from './scripts/buildCustomerCatalog.js'

function customerCatalogPlugin() {
  return {
    name: 'matahari-customer-catalog',
    buildStart() {
      const result = buildCustomerCatalog()
      if (!result.ok) {
        const details = Array.isArray(result.validationErrors)
          ? `\n${result.validationErrors.slice(0, 20).join('\n')}`
          : ''
        throw new Error(`${result.error || 'Customer catalogue build failed.'}${details}`)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), customerCatalogPlugin()],
  server: {
    proxy: {
      '/api/studio': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
})
