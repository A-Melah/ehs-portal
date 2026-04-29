/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#edfcf4',
          100: '#d3f8e3',
          200: '#aaf0cb',
          300: '#72e3ac',
          400: '#38ce87',
          500: '#15b36e',
          600: '#0a9159',
          700: '#087349',
          800: '#0a5c3b',
          900: '#094c32',
          950: '#042b1d',
        },
        danger: {
          50:  '#fff1f1',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
        },
        warn: {
          50:  '#fffbeb',
          400: '#fbbf24',
          500: '#f59e0b',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        body:    ['var(--font-body)', 'sans-serif'],
        mono:    ['var(--font-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
};
