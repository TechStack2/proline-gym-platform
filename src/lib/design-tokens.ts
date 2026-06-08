/**
 * Design Token Constants — Proline Gym Platform
 * 
 * All design tokens in one place for both runtime and build-time use.
 * These sync with tailwind.config.ts and globals.css.
 */

// ─── COLOR TOKENS ──────────────────────────────────────────

export const COLORS = {
  primary: {
    50: '#fef2f2',
    100: '#fee2e2',
    500: '#ef4444',
    600: '#dc2626',
    700: '#cd1419',
  },
  secondary: {
    50: '#f7f7f7',
    500: '#666666',
    700: '#434343',
    900: '#252525',
  },
  accent: {
    50: '#fafafa',
    300: '#d4d4d8',
    500: '#71717a',
  },
  gold: {
    50: '#fefce8',
    500: '#eab308',
  },
  belt: {
    white: '#FFFFFF',
    yellow: '#F5D742',
    orange: '#F57C00',
    green: '#4CAF50',
    blue: '#1565C0',
    purple: '#7B1FA2',
    brown: '#5D4037',
    black: '#212121',
  },
  status: {
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  },
} as const;

// ─── FONT TOKENS ───────────────────────────────────────────

export const FONTS = {
  arabic: "'Noto Naskh Arabic', serif",
  latin: "'Inter', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', Menlo, monospace",
} as const;

// ─── BREAKPOINTS ───────────────────────────────────────────

export const BREAKPOINTS = {
  xs: 375,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

// ─── BORDER RADII ──────────────────────────────────────────

export const RADII = {
  sm: '0.375rem',
  md: '0.5rem',
  lg: '0.75rem',
  xl: '1rem',
  '2xl': '1.5rem',
} as const;

// ─── SHADOWS ───────────────────────────────────────────────

export const SHADOWS = {
  elevation1: '0 1px 3px 0 rgba(0, 0, 0, 0.08)',
  elevation2: '0 4px 6px -1px rgba(0, 0, 0, 0.08)',
  elevation3: '0 10px 15px -3px rgba(0, 0, 0, 0.08)',
  elevation4: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
} as const;

// ─── BELT PROGRESSION MAP ──────────────────────────────────

export const BELT_PROGRESSION = {
  bjj: ['white', 'blue', 'purple', 'brown', 'black_1'],
  karate: ['white', 'yellow', 'orange', 'green', 'blue', 'brown', 'black_1'],
  judo: ['white', 'yellow', 'orange', 'green', 'blue', 'brown', 'black_1'],
  taekwondo: ['white', 'yellow', 'green', 'blue', 'brown', 'brown_black', 'black_1'],
  muay_thai: ['white', 'yellow', 'yellow_orange', 'orange', 'orange_green', 'green', 'green_blue', 'blue', 'purple', 'brown', 'black_1'],
  boxing: ['white', 'blue', 'brown'],
} as const;

// ─── ROLE HIERARCHY ────────────────────────────────────────

export const ROLES = [
  'owner',
  'head_coach',
  'coach',
  'receptionist',
  'student',
  'parent',
  'external_coach',
] as const;

export type Role = (typeof ROLES)[number];

// ─── ROLE PERMISSIONS ──────────────────────────────────────

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  owner: ['*'],
  head_coach: ['students:read', 'students:write', 'classes:read', 'classes:write', 'attendance:read', 'attendance:write', 'payments:read', 'reports:read'],
  coach: ['students:read', 'classes:read', 'attendance:write', 'pt:write'],
  receptionist: ['students:read', 'students:write', 'payments:write', 'leads:read', 'leads:write', 'trials:write'],
  student: ['profile:read', 'profile:write', 'classes:read', 'schedule:read', 'attendance:read', 'payments:read', 'invoices:read'],
  parent: ['profile:read', 'classes:read', 'schedule:read', 'attendance:read', 'payments:read', 'invoices:read'],
  external_coach: ['classes:read', 'schedule:read', 'attendance:write', 'pt:write'],
};
