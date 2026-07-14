/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        page: 'var(--bg-page)',
        surface: {
          1: 'var(--bg-surface-1)',
          2: 'var(--bg-surface-2)',
        },
        accent: 'var(--accent)',
      },
    },
  },
  plugins: [],
};
