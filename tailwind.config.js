/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'spotted': {
          green: '#00aa4f',
          'green-dark': '#008c41',
          yellow: '#ffcc00',
          red: '#ef4444',
        }
      },
    },
  },
  plugins: [],
}
