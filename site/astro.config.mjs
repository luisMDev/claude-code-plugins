import { defineConfig } from 'astro/config'

// Served by GitHub Pages at https://luismdev.github.io/claude-code-plugins/
export default defineConfig({
  site: 'https://luismdev.github.io',
  base: '/claude-code-plugins',
  // An inline PostCSS config stops Vite from picking up one from a parent folder.
  vite: { css: { postcss: {} } },
})
