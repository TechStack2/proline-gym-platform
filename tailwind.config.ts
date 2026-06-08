import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      // ────────────────────────────────────────
      // COLOR SYSTEM — Proline Gym Brand Identity
      // Extracted from official logo:
      //   Primary: Crimson Red #cd1419
      //   Dark: Near-black #1f1f1f–#313131
      //   Light: Silver/Gray #d0d0d0–#e0e0e0
      // ────────────────────────────────────────
      colors: {
        // Primary brand — crimson red (from logo)
        primary: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#cd1419',
          800: '#991b1b',
          900: '#7f1d1d',
          950: '#450a0a',
          DEFAULT: '#cd1419',
          foreground: '#ffffff',
        },
        // Secondary — dark charcoal (from logo)
        secondary: {
          50: '#f7f7f7',
          100: '#e3e3e3',
          200: '#c8c8c8',
          300: '#a4a4a4',
          400: '#818181',
          500: '#666666',
          600: '#515151',
          700: '#434343',
          800: '#383838',
          900: '#252525',
          950: '#1f1f1f',
          DEFAULT: '#252525',
          foreground: '#ffffff',
        },
        // Accent — silver/chrome (from logo highlights)
        accent: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          800: '#27272a',
          900: '#18181b',
          DEFAULT: '#d4d4d8',
          foreground: '#18181b',
        },
        // Gold accent — excellence, premium
        gold: {
          50: '#fefce8',
          100: '#fef9c3',
          200: '#fef08a',
          300: '#fde047',
          400: '#facc15',
          500: '#eab308',
          600: '#ca8a04',
          700: '#a16207',
          800: '#854d0e',
          900: '#713f12',
          DEFAULT: '#eab308',
        },
        // Belt rank colors — martial arts belt system
        belt: {
          white: '#FFFFFF',
          white_yellow: '#F0E68C',
          yellow: '#F5D742',
          yellow_orange: '#F5A742',
          orange: '#F57C00',
          orange_green: '#8BC34A',
          green: '#4CAF50',
          green_blue: '#2196F3',
          blue: '#1565C0',
          purple: '#7B1FA2',
          brown: '#5D4037',
          brown_black: '#3E2723',
          red: '#C62828',
          black: '#212121',
          black_1: '#212121',
          black_2: '#212121',
          black_3: '#212121',
          black_4: '#212121',
          black_5: '#212121',
        },
        // Semantic status colors
        success: {
          50: '#f0fdf4',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          DEFAULT: '#22c55e',
          foreground: '#ffffff',
        },
        warning: {
          50: '#fffbeb',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          DEFAULT: '#f59e0b',
          foreground: '#ffffff',
        },
        destructive: {
          50: '#fef2f2',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          DEFAULT: '#ef4444',
          foreground: '#ffffff',
        },
        info: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          DEFAULT: '#3b82f6',
          foreground: '#ffffff',
        },
        // Surfaces
        background: '#ffffff',
        foreground: '#111827',
        muted: {
          DEFAULT: '#f3f4f6',
          foreground: '#6b7280',
        },
        card: {
          DEFAULT: '#ffffff',
          foreground: '#111827',
        },
        border: '#e5e7eb',
        input: '#e5e7eb',
        ring: '#cd1419',
      },

      // ────────────────────────────────────────
      // TYPOGRAPHY — Tri-lingual font stack
      // ────────────────────────────────────────
      fontFamily: {
        arabic: ['Noto Naskh Arabic', 'serif'],
        latin: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
        'display-lg': ['3rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display-md': ['2.25rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        'display-sm': ['1.875rem', { lineHeight: '1.3' }],
      },
      fontWeight: {
        'arabic-regular': '400',
        'arabic-bold': '700',
      },

      // ────────────────────────────────────────
      // SPACING — 4px base grid
      // ────────────────────────────────────────
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '26': '6.5rem',
        '30': '7.5rem',
        '34': '8.5rem',
      },

      // ────────────────────────────────────────
      // BORDER RADIUS — Lebanese architecture influence
      // ────────────────────────────────────────
      borderRadius: {
        'sm': '0.375rem',
        'md': '0.5rem',
        'lg': '0.75rem',
        'xl': '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
        DEFAULT: '0.5rem',
      },

      // ────────────────────────────────────────
      // SHADOWS — Material Design influence
      // ────────────────────────────────────────
      boxShadow: {
        'elevation-1': '0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 1px 2px -1px rgba(0, 0, 0, 0.08)',
        'elevation-2': '0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
        'elevation-3': '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.05)',
        'elevation-4': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
        'glow-primary': '0 0 20px -5px rgba(205, 20, 25, 0.2)',
      },

      // ────────────────────────────────────────
      // ANIMATIONS — Subtle, performant
      // ────────────────────────────────────────
      keyframes: {
        'slide-in-from-right': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-in-from-left': {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-out-to-right': {
          '0%': { transform: 'translateX(0)', opacity: '1' },
          '100%': { transform: 'translateX(100%)', opacity: '0' },
        },
        'slide-out-to-left': {
          '0%': { transform: 'translateX(0)', opacity: '1' },
          '100%': { transform: 'translateX(-100%)', opacity: '0' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'skeleton': {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        'slide-in-from-right': 'slide-in-from-right 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-from-left': 'slide-in-from-left 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-out-to-right': 'slide-out-to-right 0.2s ease-in',
        'slide-out-to-left': 'slide-out-to-left 0.2s ease-in',
        'fade-in': 'fade-in 0.15s ease-out',
        'fade-out': 'fade-out 0.15s ease-in',
        'scale-in': 'scale-in 0.15s ease-out',
        'skeleton': 'skeleton 1.5s ease-in-out infinite',
      },
    },

    // ────────────────────────────────────────
    // RESPONSIVE BREAKPOINTS — Mobile-first
    // ────────────────────────────────────────
    screens: {
      'xs': '375px',   // Small phone
      'sm': '640px',   // Large phone
      'md': '768px',   // Tablet portrait
      'lg': '1024px',  // Tablet landscape / small laptop
      'xl': '1280px',  // Desktop
      '2xl': '1536px', // Large desktop
    },
  },
  plugins: [animate],
};

export default config;
