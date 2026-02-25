/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary palette — deep navy + warm off-white + amber
        ink:    '#0E1628',   // near-black for text
        navy:   '#1B2B4B',   // primary backgrounds
        slate:  '#2C3F5E',   // secondary surfaces
        steel:  '#4A6080',   // borders, muted
        mist:   '#8FA0B5',   // placeholder text
        paper:  '#F4F1EB',   // off-white backgrounds
        cream:  '#FAF8F4',   // lightest surface
        white:  '#FFFFFF',
        // Accent
        amber:  '#C9893A',   // primary CTA
        'amber-light': '#E5A85C',
        'amber-dim':   '#8C5E24',
        // Status
        success: '#2D7A4F',
        error:   '#B03A2E',
        warning: '#C9893A',
      },
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        body:    ['DM Sans', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'display-xl': ['3.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display-lg': ['2.5rem', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        'display-md': ['1.875rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      borderRadius: {
        'sm': '4px',
        DEFAULT: '8px',
        'md': '12px',
        'lg': '16px',
        'xl': '24px',
      },
      boxShadow: {
        'lift':    '0 4px 24px rgba(14,22,40,0.12)',
        'deep':    '0 8px 48px rgba(14,22,40,0.18)',
        'glow':    '0 0 0 3px rgba(201,137,58,0.25)',
        'inset':   'inset 0 1px 3px rgba(14,22,40,0.08)',
      },
      backgroundImage: {
        'paper-texture': "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E\")",
      },
      animation: {
        'fade-up':    'fadeUp 0.5s ease forwards',
        'fade-in':    'fadeIn 0.4s ease forwards',
        'slide-in':   'slideIn 0.3s ease forwards',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'shimmer':    'shimmer 1.8s ease-in-out infinite',
        'dot-bounce': 'dotBounce 1.2s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%':   { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        dotBounce: {
          '0%, 80%, 100%': { transform: 'scale(0.6)', opacity: '0.4' },
          '40%':           { transform: 'scale(1)',   opacity: '1'   },
        },
      },
    },
  },
  plugins: [],
}
