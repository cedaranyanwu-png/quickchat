// Create React App 5 only enables its Tailwind PostCSS plugin when this file is at the project root.
// The scan includes every React page and component so responsive utility styles are emitted in production.
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#0f172a',
        },
      },
    },
  },
  plugins: [],
};
