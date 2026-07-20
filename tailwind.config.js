/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#1B2A55',
          dark: '#131F41',
          light: '#33447A',
        },
        mint: {
          DEFAULT: '#4FAE73',
          soft: '#DCF1E3',
          softer: '#EAF7EE',
        },
        sky: {
          soft: '#E1E6FB',
        },
        sand: {
          soft: '#EFE8DC',
        },
        canvas: '#F2F4FA',
        ink: {
          DEFAULT: '#1B2A55',
          muted: '#6B7280',
          faint: '#9AA1B4',
        },
      },
      fontFamily: {
        sans: ['Pretendard', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Malgun Gothic', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      boxShadow: {
        card: '0 4px 20px rgba(27, 42, 85, 0.06)',
        soft: '0 8px 30px rgba(27, 42, 85, 0.10)',
      },
    },
  },
  plugins: [],
};