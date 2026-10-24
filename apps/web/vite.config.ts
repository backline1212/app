import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// A static release marker lets operators check the web deployment independently
// of the API and of hashed bundle names. Vercel only exposes this variable when
// system environment variables are enabled for the project.
const releaseMarker: Plugin = {
  name: 'backline-release-marker',
  apply: 'build',
  generateBundle() {
    const rawSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase()
    const releaseSha = rawSha && /^[0-9a-f]{40}$/.test(rawSha) ? rawSha : null
    this.emitFile({
      type: 'asset',
      fileName: 'release.json',
      source: JSON.stringify({ release_sha: releaseSha }) + '\n',
    })
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), releaseMarker],
})
