/** @type {import('tailwindcss').Config} */

// 디자인 토큰(src/styles/tokens.css)의 CSS 변수를 색상으로 연결.
// alpha 지원을 위해 "R G B" 채널 + <alpha-value> 패턴 사용.
const tv = (name) => `rgb(var(${name}) / <alpha-value>)`;
const triple = (name) => ({
  DEFAULT: tv(name),
  soft: tv(`${name}-soft`),
  fg: tv(`${name}-fg`),
});

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: tv('--brand-50'),
          100: tv('--brand-100'),
          200: tv('--brand-200'),
          300: tv('--brand-300'),
          400: tv('--brand-400'),
          500: tv('--brand-500'),
          600: tv('--brand-600'),
          700: tv('--brand-700'),
          800: tv('--brand-800'),
          900: tv('--brand-900'),
        },
        success: triple('--success'),
        warning: triple('--warning'),
        danger: triple('--danger'),
        info: triple('--info'),
        surface: {
          DEFAULT: tv('--surface'),
          muted: tv('--surface-muted'),
        },
      },
      fontFamily: {
        sans: [
          'Pretendard Variable',
          'Pretendard',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Apple SD Gothic Neo',
          'Malgun Gothic',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
