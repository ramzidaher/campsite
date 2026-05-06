import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      keyframes: {
        'employee-modal-backdrop': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'employee-modal-panel': {
          '0%': { opacity: '0', transform: 'translateY(14px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'skeleton-shimmer': {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        /** Broadcast compose send control  vertical bob on paper-plane icon (motion-safe only in component). */
        'send-btn-icon-bob': {
          from: { transform: 'translateY(0.1em)' },
          to: { transform: 'translateY(-0.1em)' },
        },
      },
      animation: {
        'employee-modal-backdrop': 'employee-modal-backdrop 0.22s ease-out forwards',
        'employee-modal-panel':
          'employee-modal-panel 0.34s cubic-bezier(0.22, 1, 0.36, 1) 0.04s both',
        'skeleton-shimmer': 'skeleton-shimmer 1.8s ease-in-out infinite',
        'send-btn-icon-bob': 'send-btn-icon-bob 0.6s ease-in-out infinite alternate',
      },
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
