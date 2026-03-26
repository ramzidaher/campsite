import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        authSerif: ['var(--font-auth-serif)', 'Georgia', 'ui-serif', 'serif'],
      },
      colors: {
        campsite: {
          bg: 'var(--campsite-bg)',
          surface: 'var(--campsite-surface)',
          text: 'var(--campsite-text)',
          'text-secondary': 'var(--campsite-text-secondary)',
          border: 'var(--campsite-border)',
          accent: 'var(--campsite-accent)',
        },
      },
    },
  },
  plugins: [],
};
export default config;
