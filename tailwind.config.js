/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: 'rgb(var(--c-surface) / <alpha-value>)',
          50:      'rgb(var(--c-surface-50) / <alpha-value>)',
          100:     'rgb(var(--c-surface-100) / <alpha-value>)',
          200:     'rgb(var(--c-surface-200) / <alpha-value>)',
          300:     'rgb(var(--c-surface-300) / <alpha-value>)',
        },
        accent: {
          green:  'rgb(var(--c-accent-green) / <alpha-value>)',
          red:    'rgb(var(--c-accent-red) / <alpha-value>)',
          yellow: 'rgb(var(--c-accent-yellow) / <alpha-value>)',
          blue:   'rgb(var(--c-accent-blue) / <alpha-value>)',
          purple: 'rgb(var(--c-accent-purple) / <alpha-value>)',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
