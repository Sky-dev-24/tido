import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { webSocketServer } from './src/lib/vite-plugin-websocket.js';

export default defineConfig({
  plugins: [sveltekit(), webSocketServer()]
});
