import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The site is served from https://ankityadavpurson.github.io/udbw/
export default defineConfig({ base: '/udbw/', plugins: [react()] });
