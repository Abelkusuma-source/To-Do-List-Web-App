import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://example.com',
  srcDir: './src',
  outDir: './dist',
  vite: {
    plugins: [tailwindcss()],
  },
});
