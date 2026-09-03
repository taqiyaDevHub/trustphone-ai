/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: '#07111F',
        panel: '#0D1B2A',
        accent: '#2563EB',
        cyan: '#06B6D4',
        muted: '#94A3B8',
        border: '#1E3A5F',
      },
    },
  },
  plugins: [],
}