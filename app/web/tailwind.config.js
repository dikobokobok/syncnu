/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dark theme surfaces
        surface: {
          base:     '#0f172a',  // deepest bg
          main:     '#111827',  // sidebar
          card:     '#1e293b',  // cards
          elevated: '#243347',  // hover/elevated cards
          border:   '#1e293b',  // subtle borders
          line:     '#334155',  // visible dividers
        },
        brand: {
          blue:  '#3b82f6',
          light: '#60a5fa',
          dim:   'rgba(59,130,246,0.15)',
        },
        tx: {
          primary:   '#f1f5f9',
          secondary: '#94a3b8',
          muted:     '#64748b',
          accent:    '#3b82f6',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        'card-hover': '0 8px 24px rgba(0,0,0,0.5)',
        'glow-blue': '0 0 20px rgba(59,130,246,0.25)',
      },
    },
  },
  plugins: [],
}
