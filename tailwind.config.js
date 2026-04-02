/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['Manrope', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 18px 45px -28px rgba(15, 23, 42, 0.35)',
      },
      backgroundImage: {
        'emerald-haze':
          'radial-gradient(circle at top left, rgba(16, 185, 129, 0.18), transparent 40%), radial-gradient(circle at bottom right, rgba(59, 130, 246, 0.12), transparent 40%)',
      },
    },
  },
  plugins: [],
};
