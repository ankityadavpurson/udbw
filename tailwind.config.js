import xedonium from 'xedonium/tailwind-preset';

export default {
  presets: [xedonium],
  content: ['./src/index.html', './src/**/*.{js,jsx}', './node_modules/xedonium/dist/**/*.js'],
  darkMode: ['class', '[data-theme="dark"]']
};
