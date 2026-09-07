/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Trustworthy deep blue — the primary brand color
        primary: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
        // Ink — text colors on the light canvas
        ink: {
          DEFAULT: '#0F172A',
          soft: '#334155',
          muted: '#64748B',
          faint: '#94A3B8',
        },
        // Structural colors
        line: '#E2E8F0',
        canvas: '#F5F7FB',
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'monospace',
        ],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        'card-hover':
          '0 10px 24px -8px rgb(15 23 42 / 0.12), 0 4px 8px -4px rgb(15 23 42 / 0.05)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        rise: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'scan-sweep': {
          '0%': { top: '2%', opacity: '0' },
          '15%': { opacity: '1' },
          '85%': { opacity: '1' },
          '100%': { top: '98%', opacity: '0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out both',
        rise: 'rise 0.45s cubic-bezier(0.16, 1, 0.3, 1) both',
        'scale-in': 'scale-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
        'scan-sweep': 'scan-sweep 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
