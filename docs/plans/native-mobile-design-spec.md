# PRO LINE Gym — Unified Native Mobile Design Specification

> **Version:** 1.0  
> **Status:** DRAFT — For Review  
> **Target:** PWA on iOS/Android — indistinguishable from native app  
> **Portals:** Staff Dashboard `(dashboard)`, Coach App `coach/`, Member Portal `portal/`  
> **Languages:** AR (RTL primary), EN, FR  
> **Project Root:** `Agentics/Projects/proline-gym-platform/`

---

## Table of Contents

1. [Design System Tokens](#1-design-system-tokens)
2. [Shared Native Primitives](#2-shared-native-primitives)
3. [Portal A: Staff Dashboard `(dashboard)`](#3-portal-a-staff-dashboard)
4. [Portal B: Coach App `coach/`](#4-portal-b-coach-app)
5. [Portal C: Member Portal `portal/`](#5-portal-c-member-portal)
6. [i18n Key Additions](#6-i18n-key-additions)
7. [Implementation Order](#7-implementation-order)
8. [Parallel Agent Dispatch Map](#8-parallel-agent-dispatch-map)

---

## 1. Design System Tokens

All tokens extend the existing [`src/lib/design-tokens.ts`](../../src/lib/design-tokens.ts) and [`tailwind.config.ts`](../../tailwind.config.ts). The following additions are needed for native-mobile feel.

### 1.1 New Color Tokens

Add to [`src/lib/design-tokens.ts`](../../src/lib/design-tokens.ts):

```typescript
export const NATIVE = {
  // Frosted glass (tab bar, sheets)
  glass: {
    light: 'rgba(255, 255, 255, 0.72)',
    dark: 'rgba(37, 37, 37, 0.78)',
    border: 'rgba(255, 255, 255, 0.18)',
  },
  // Safe area
  safeArea: {
    top: 'env(safe-area-inset-top)',
    bottom: 'env(safe-area-inset-bottom)',
    left: 'env(safe-area-inset-left)',
    right: 'env(safe-area-inset-right)',
  },
  // Tab bar
  tabBar: {
    height: 64,           // 56px content + 8px safe-area padding
    iconSize: 22,
    fontSize: '0.625rem', // 10px
    activeScale: 1.1,     // scale bounce on tap
  },
  // Animation durations
  animation: {
    tabBounce: 200,       // ms
    slideTransition: 250, // ms
    sheetPresent: 300,    // ms
  },
} as const;
```

### 1.2 Tailwind Extensions Needed

Add to [`tailwind.config.ts`](../../tailwind.config.ts) `theme.extend`:

```typescript
backdropBlur: {
  'glass': '16px',
},
animation: {
  'tab-bounce': 'tabBounce 200ms ease-out',
  'slide-in-right': 'slideInRight 250ms ease-out',
  'slide-in-left': 'slideInLeft 250ms ease-out',
  'sheet-up': 'sheetUp 300ms cubic-bezier(0.32, 0.72, 0, 1)',
},
keyframes: {
  tabBounce: {
    '0%': { transform: 'scale(1)' },
    '50%': { transform: 'scale(1.1)' },
    '100%': { transform: 'scale(1)' },
  },
  slideInRight: {
    '0%': { transform: 'translateX(100%)' },
    '100%': { transform: 'translateX(0)' },
  },
  slideInLeft: {
    '0%': { transform: 'translateX(-100%)' },
    '100%': { transform: 'translateX(0)' },
  },
  sheetUp: {
    '0%': { transform: 'translateY(100%)' },
    '100%': { transform: 'translateY(0)' },
  },
},
```

### 1.3 CSS Safe-Area Utilities

Add to [`src/app/globals.css`](../../src/app/globals.css) `@layer utilities`:

```css
/* Safe area insets */
.safe-area-top {
  padding-top: env(safe-area-inset-top, 0px);
}
.safe-area-bottom {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.safe-area-left {
  padding-left: env(safe-area-inset-left, 0px);
}
.safe-area-right {
  padding-right: env(safe-area-inset-right, 0px);
}

/* Frosted glass backdrop */
.glass-tab-bar {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-top: 0.5px solid rgba(0, 0, 0, 0.08);
}

/* Dark mode glass (for sheets/modals) */
.glass-dark {
  background: rgba(37, 37, 37, 0.78);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

/* Active tab indicator */
.tab-indicator {
  width: 20px;
  height: 3px;
  border-radius: 1.5px;
  background: #cd1419;
  margin-top: 2px;
  transition: all 200ms ease-out;
}

/* Touch-friendly minimum */
.touch-min {
  min-height: 44px;
  min-width: 44px;
}
```

---

## 2. Shared Native Primitives

All shared primitives live in `src/components/native/`. Each is a `'use client'` component.

### 2.1 `NativeTabBar`

**File:** [`src/components/native/NativeTabBar.tsx`](../../src/components/native/NativeTabBar.tsx)

**Props Interface:**

```typescript
export type TabItem = {
  key: string;                    // i18n key under 'nav.*'
  icon: React.ComponentType<{ className?: string }>;
  path: string;                   // relative path e.g. '/dashboard'
  badge?: number;                 // optional notification badge
};

export type NativeTabBarProps = {
  tabs: TabItem[];
  locale: string;
  basePath: string;               // e.g. '/dashboard' or '/coach'
  variant?: 'default' | 'compact'; // compact = no labels, icons only
};
```

**Behavior:**
- Frosted glass background (`glass-tab-bar` class)
- Safe-area bottom padding (`safe-area-bottom`)
- Active tab: icon scales to 1.1x on tap (CSS `tab-bounce` animation)
- Active indicator: small red bar under active icon
- i18n labels via `useTranslations('nav')` — keys are `tab.key`
- RTL-aware: flips order when `locale === 'ar'`
- Badge: red dot with count if `badge > 0`

**Internal State:**
- `activeTab: string` — derived from `usePathname()`
- `animatingTab: string | null` — set on click, cleared after 200ms

**Key Implementation Details:**
```tsx
// Active detection logic
const isActive = pathname === fullPath 
  || (tab.path !== basePath && pathname.startsWith(fullPath));

// Scale animation on click
const handleTabClick = (key: string) => {
  setAnimatingTab(key);
  setTimeout(() => setAnimatingTab(null), 200);
};
```

### 2.2 `NativeHeader`

**File:** [`src/components/native/NativeHeader.tsx`](../../src/components/native/NativeHeader.tsx)

**Props Interface:**

```typescript
export type NativeHeaderProps = {
  title: string;                  // Page title (already translated)
  locale: string;
  role?: string;                  // Role badge (Staff Dashboard only)
  showBack?: boolean;             // Show back arrow
  onBack?: () => void;            // Custom back handler
  rightActions?: React.ReactNode; // Notification bell, language switcher
  variant?: 'large' | 'compact';  // Large = collapsible on scroll
};
```

**Behavior:**
- Sticky top with safe-area-top padding
- Large title (34px font) collapses to 20px on scroll (iOS-style)
- Role badge: small pill with role name + color dot (Staff Dashboard only)
- Back button: chevron-left icon, RTL-aware (flips to chevron-right)
- Right actions slot for notification bell + language switcher
- Uses `IntersectionObserver` or scroll event for collapse animation

**Role Badge Colors:**
| Role | Badge Color |
|------|-------------|
| `owner` | Gold `#eab308` |
| `head_coach` | Blue `#3b82f6` |
| `receptionist` | Green `#22c55e` |
| `coach` | Purple `#a855f7` |

### 2.3 `SwipeableSheet`

**File:** [`src/components/native/SwipeableSheet.tsx`](../../src/components/native/SwipeableSheet.tsx)

**Props Interface:**

```typescript
export type SwipeableSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  snapPoints?: number[];          // e.g. [50, 75, 100] = % of screen height
  initialSnap?: number;           // default 50
  locale: string;
};
```

**Behavior:**
- Slides up from bottom with `sheetUp` animation
- Backdrop overlay (semi-transparent black, tap to close)
- Drag handle at top (horizontal bar)
- Touch drag to dismiss or snap to snapPoints
- Frosted glass background in dark mode
- Safe-area-bottom padding
- RTL-aware: content flips, drag direction respects locale

**Implementation Notes:**
- Use `framer-motion` or raw CSS `transform: translateY()` with touch events
- Track `startY`, `currentY` for drag
- If drag distance > 30% of screen height, dismiss
- Otherwise snap back to `initialSnap`

### 2.4 `PageTransition`

**File:** [`src/components/native/PageTransition.tsx`](../../src/components/native/PageTransition.tsx)

**Props Interface:**

```typescript
export type PageTransitionProps = {
  children: React.ReactNode;
  direction: 'left' | 'right';    // Slide direction
  locale: string;                 // RTL inverts direction
};
```

**Behavior:**
- Wraps page content in animated container
- Slides content in from right (LTR) or left (RTL) on mount
- 250ms ease-out animation
- Uses `slideInRight` / `slideInLeft` keyframes
- Respects `prefers-reduced-motion`

---

## 3. Portal A: Staff Dashboard `(dashboard)`

### 3.1 Current State

- [`src/app/[locale]/(dashboard)/layout.tsx`](../../src/app/[locale]/(dashboard)/layout.tsx): Desktop sidebar + Header. No mobile-native tab bar.
- [`src/components/layout/Sidebar.tsx`](../../src/components/layout/Sidebar.tsx): 14 nav items, role-filtered. Desktop only (`hidden lg:flex`).
- [`src/components/layout/Header.tsx`](../../src/components/layout/Header.tsx): Search bar, language switcher, notification bell, logout, role label. Has hamburger for mobile sidebar that's not fully implemented.

### 3.2 Target Layout

**Mobile (≤768px):**
```
┌──────────────────────────────┐
│         NativeHeader          │  ← Role badge, bell, lang switcher
│  (collapsible large title)    │
├──────────────────────────────┤
│                              │
│     Page Content (children)   │  ← Slide transition between tabs
│                              │
│                              │
├──────────────────────────────┤
│  ┌──┬──┬──┬──┬──┐           │
│  │DS│ST│CL│AT│MO│  ← 5 tabs │  ← Frosted glass NativeTabBar
│  └──┴──┴──┴──┴──┘           │
│         safe-area-bottom      │
└──────────────────────────────┘
```

**Desktop (≥769px):**
```
┌──────┬───────────────────────────┐
│      │     NativeHeader           │
│      │  (compact, no collapse)    │
│ Side │───────────────────────────│
│ bar  │                            │
│(kept)│    Page Content (children)  │
│      │                            │
│      │                            │
└──────┴───────────────────────────┘
```

### 3.3 File Changes

| File | Action | Description |
|------|--------|-------------|
| [`src/app/[locale]/(dashboard)/layout.tsx`](../../src/app/[locale]/(dashboard)/layout.tsx) | **MODIFY** | Add responsive split: mobile uses `NativeTabBar`, desktop keeps `Sidebar`. Wrap content in `PageTransition`. |
| [`src/components/layout/Sidebar.tsx`](../../src/components/layout/Sidebar.tsx) | **MODIFY** | Remove mobile hamburger logic. Keep as desktop-only sidebar. Add subtle polish (active indicator, hover states). |
| [`src/components/layout/Header.tsx`](../../src/components/layout/Header.tsx) | **MODIFY** | Refactor to use `NativeHeader` internally. Remove hamburger. Add role badge pill. |
| **NEW** `src/components/dashboard/DashboardTabBar.tsx` | **CREATE** | Staff-specific tab configuration using `NativeTabBar`. |
| **NEW** `src/components/dashboard/MoreSheet.tsx` | **CREATE** | Bottom sheet for "More" tab items. Uses `SwipeableSheet`. |
| **NEW** `src/components/dashboard/DashboardMobileLayout.tsx` | **CREATE** | Mobile wrapper: NativeHeader + PageTransition + NativeTabBar. |

### 3.4 Tab Definitions

**5 Primary Tabs (Mobile Bottom Nav):**

| # | Key | Icon | Path | i18n Key | Roles |
|---|-----|------|------|----------|-------|
| 1 | `dashboard` | `LayoutDashboard` | `/dashboard` | `nav.dashboard` | All |
| 2 | `students` | `Users` | `/students` | `nav.students` | owner, head_coach, receptionist |
| 3 | `classes` | `Dumbbell` | `/classes` | `nav.classes` | owner, head_coach |
| 4 | `attendance` | `ClipboardList` | `/attendance` | `nav.attendance` | owner, head_coach |
| 5 | `more` | `Ellipsis` | — (opens sheet) | `nav.more` | All |

**"More" Sheet Items (SwipeableSheet):**

| # | Key | Icon | Path | i18n Key | Roles |
|---|-----|------|------|----------|-------|
| 1 | `payments` | `DollarSign` | `/payments` | `nav.payments` | owner, receptionist |
| 2 | `invoices` | `Receipt` | `/invoices` | `nav.invoices` | owner, receptionist |
| 3 | `ptSessions` | `Dumbbell` | `/pt` | `nav.ptSessions` | owner, head_coach |
| 4 | `rentals` | `Building` | `/rentals` | `nav.rentals` | owner |
| 5 | `camps` | `Tent` | `/camps` | `nav.camps` | owner, receptionist |
| 6 | `leads` | `UserPlus` | `/leads` | `nav.leads` | owner, receptionist |
| 7 | `reports` | `BarChart3` | `/reports` | `nav.reports` | owner, head_coach |
| 8 | `settings` | `Settings` | `/settings` | `nav.settings` | owner |
| 9 | `profile` | `User` | `/profile` | `nav.profile` | All |

### 3.5 Layout Component Tree

```
DashboardLayout (server component)
├── Desktop branch (lg:flex)
│   ├── Sidebar (existing, polished)
│   └── Content area
│       ├── NativeHeader (compact variant)
│       └── <main>{children}</main>
│
└── Mobile branch (lg:hidden)
    └── DashboardMobileLayout (client component)
        ├── NativeHeader (large variant, collapsible)
        ├── PageTransition (slide direction)
        │   └── <main>{children}</main>
        └── DashboardTabBar
            ├── NativeTabBar (5 primary tabs)
            └── MoreSheet (SwipeableSheet with 9 items)
```

### 3.6 Modified `layout.tsx` Logic

```typescript
// Pseudocode for the responsive split
export default async function DashboardLayout({ children, params }) {
  const { locale } = params;
  const role = await getUserRole(supabase, user.id);
  const isRTL = locale === 'ar';

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden lg:flex">
        <Sidebar locale={locale} role={role} />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Desktop header — hidden on mobile */}
        <div className="hidden lg:block">
          <NativeHeader
            title={t('dashboard.title')}
            locale={locale}
            role={role}
            variant="compact"
            rightActions={<HeaderActions locale={locale} />}
          />
        </div>

        {/* Mobile layout — hidden on desktop */}
        <div className="lg:hidden flex flex-col flex-1">
          <DashboardMobileLayout locale={locale} role={role}>
            {children}
          </DashboardMobileLayout>
        </div>

        {/* Desktop content */}
        <main className="hidden lg:block flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

---

## 4. Portal B: Coach App `coach/`

### 4.1 Current State

- [`src/app/[locale]/coach/layout.tsx`](../../src/app/[locale]/coach/layout.tsx): Simple layout with `CoachBottomNav`. Uses hardcoded English labels.
- [`src/components/coach/CoachBottomNav.tsx`](../../src/components/coach/CoachBottomNav.tsx): 4 tabs with hardcoded `tab.key` as labels. No i18n. No frosted glass. No animation.
- [`src/app/[locale]/coach/page.tsx`](../../src/app/[locale]/coach/page.tsx): Schedule page with hardcoded Arabic/English strings.

### 4.2 What Changes

| File | Action | Description |
|------|--------|-------------|
| [`src/app/[locale]/coach/layout.tsx`](../../src/app/[locale]/coach/layout.tsx) | **MODIFY** | Replace `CoachBottomNav` with `NativeTabBar`. Add `NativeHeader`. Wrap in `PageTransition`. |
| [`src/components/coach/CoachBottomNav.tsx`](../../src/components/coach/CoachBottomNav.tsx) | **DELETE** | Replaced by shared `NativeTabBar`. |
| **NEW** `src/components/coach/CoachTabConfig.ts` | **CREATE** | Tab configuration for coach portal. |
| [`src/app/[locale]/coach/page.tsx`](../../src/app/[locale]/coach/page.tsx) | **MODIFY** | Use `getTranslations('nav')` for title. |

### 4.3 Tab Definitions

| # | Key | Icon | Path | i18n Key |
|---|-----|------|------|----------|
| 1 | `schedule` | `Calendar` | `/coach` | `nav.schedule` |
| 2 | `attendance` | `ClipboardCheck` | `/coach/attendance` | `nav.attendance` |
| 3 | `students` | `Users` | `/coach/students` | `nav.students` |
| 4 | `profile` | `User` | `/coach/profile` | `nav.profile` |

**Note:** `ClipboardCheck` icon replaces `ClipboardList` for visual distinction from Staff Dashboard.

### 4.4 Target Layout

```
┌──────────────────────────────┐
│         NativeHeader          │
│  "My Schedule" (i18n)        │
├──────────────────────────────┤
│                              │
│     Page Content (children)   │
│                              │
│                              │
├──────────────────────────────┤
│  ┌──┬──┬──┬──┐              │
│  │SC│AT│ST│PR│  ← 4 tabs    │  ← Frosted glass NativeTabBar
│  └──┴──┴──┴──┘              │
│         safe-area-bottom      │
└──────────────────────────────┘
```

### 4.5 Modified `layout.tsx`

```typescript
// CoachLayout — simplified with shared primitives
import { NativeTabBar } from '@/components/native/NativeTabBar';
import { NativeHeader } from '@/components/native/NativeHeader';
import { PageTransition } from '@/components/native/PageTransition';
import { COACH_TABS } from '@/components/coach/CoachTabConfig';

export default async function CoachLayout({ children, params }) {
  const { locale } = params;
  // ... auth check ...

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <NativeHeader
        title={/* i18n title based on active tab */}
        locale={locale}
        variant="large"
      />
      <main className="flex-1 overflow-y-auto">
        <PageTransition direction="right" locale={locale}>
          {children}
        </PageTransition>
      </main>
      <NativeTabBar
        tabs={COACH_TABS}
        locale={locale}
        basePath="/coach"
      />
    </div>
  );
}
```

---

## 5. Portal C: Member Portal `portal/`

### 5.1 Current State

- [`src/app/[locale]/portal/layout.tsx`](../../src/app/[locale]/portal/layout.tsx): Simple layout with `PortalBottomNav`. Same hardcoded issues as Coach.
- [`src/components/portal/PortalBottomNav.tsx`](../../src/components/portal/PortalBottomNav.tsx): 4 tabs with hardcoded keys. No i18n, no glass, no animation.
- [`src/app/[locale]/portal/page.tsx`](../../src/app/[locale]/portal/page.tsx): Welcome page with hardcoded strings.

### 5.2 What Changes

| File | Action | Description |
|------|--------|-------------|
| [`src/app/[locale]/portal/layout.tsx`](../../src/app/[locale]/portal/layout.tsx) | **MODIFY** | Replace `PortalBottomNav` with `NativeTabBar`. Add `NativeHeader`. Wrap in `PageTransition`. |
| [`src/components/portal/PortalBottomNav.tsx`](../../src/components/portal/PortalBottomNav.tsx) | **DELETE** | Replaced by shared `NativeTabBar`. |
| **NEW** `src/components/portal/PortalTabConfig.ts` | **CREATE** | Tab configuration for member portal. |
| [`src/app/[locale]/portal/page.tsx`](../../src/app/[locale]/portal/page.tsx) | **MODIFY** | Use `getTranslations('nav')` for title. |

### 5.3 Tab Definitions

| # | Key | Icon | Path | i18n Key |
|---|-----|------|------|----------|
| 1 | `home` | `Grid` | `/portal` | `nav.home` |
| 2 | `schedule` | `Calendar` | `/portal/schedule` | `nav.schedule` |
| 3 | `billing` | `CreditCard` | `/portal/billing` | `nav.billing` |
| 4 | `profile` | `User` | `/portal/profile` | `nav.profile` |

**Note:** `Grid` icon replaces `LayoutDashboard` for visual distinction. The `home` key needs a new i18n entry.

### 5.4 Target Layout

```
┌──────────────────────────────┐
│         NativeHeader          │
│  "Welcome Back" (i18n)       │
├──────────────────────────────┤
│                              │
│     Page Content (children)   │
│                              │
│                              │
├──────────────────────────────┤
│  ┌──┬──┬──┬──┐              │
│  │HO│SC│BI│PR│  ← 4 tabs    │  ← Frosted glass NativeTabBar
│  └──┴──┴──┴──┘              │
│         safe-area-bottom      │
└──────────────────────────────┘
```

---

## 6. i18n Key Additions

### 6.1 New Keys Needed in All 3 Locale Files

Add to [`src/i18n/messages/en.json`](../../src/i18m/messages/en.json), [`ar.json`](../../src/i18m/messages/ar.json), [`fr.json`](../../src/i18m/messages/fr.json):

```json
{
  "nav": {
    "home": "Home",                    // Member Portal tab
    "more": "More",                    // Staff Dashboard "More" tab
    "billing": "Billing"               // Member Portal tab (already exists? check)
  },
  "native": {
    "sheet_title": "More Options",     // SwipeableSheet title
    "pull_to_close": "Pull to close",  // Accessibility
    "tab_hint": "Tab {index} of {total}"  // Accessibility for screen readers
  }
}
```

### 6.2 Arabic Translations

```json
{
  "nav": {
    "home": "الرئيسية",
    "more": "المزيد",
    "billing": "الفواتير"
  },
  "native": {
    "sheet_title": "خيارات إضافية",
    "pull_to_close": "اسحب للإغلاق",
    "tab_hint": "التبويب {index} من {total}"
  }
}
```

### 6.3 French Translations

```json
{
  "nav": {
    "home": "Accueil",
    "more": "Plus",
    "billing": "Facturation"
  },
  "native": {
    "sheet_title": "Plus d'options",
    "pull_to_close": "Tirer pour fermer",
    "tab_hint": "Onglet {index} sur {total}"
  }
}
```

---

## 7. Implementation Order

### Phase 1: Foundation (Shared Primitives)

**Agent 1 — Core Primitives**

| Step | File | Description |
|------|------|-------------|
| 1.1 | [`src/lib/design-tokens.ts`](../../src/lib/design-tokens.ts) | Add `NATIVE` token object |
| 1.2 | [`tailwind.config.ts`](../../tailwind.config.ts) | Add backdrop-blur, animations, keyframes |
| 1.3 | [`src/app/globals.css`](../../src/app/globals.css) | Add safe-area, glass, tab-indicator utilities |
| 1.4 | [`src/components/native/NativeTabBar.tsx`](../../src/components/native/NativeTabBar.tsx) | Create frosted glass tab bar with i18n, animation, safe-area |
| 1.5 | [`src/components/native/NativeHeader.tsx`](../../src/components/native/NativeHeader.tsx) | Create collapsible header with role badge |
| 1.6 | [`src/components/native/SwipeableSheet.tsx`](../../src/components/native/SwipeableSheet.tsx) | Create bottom sheet with drag-to-dismiss |
| 1.7 | [`src/components/native/PageTransition.tsx`](../../src/components/native/PageTransition.tsx) | Create slide transition wrapper |

**Dependencies:** None. This is the base layer.

### Phase 2: Portal C — Member Portal (Simplest)

**Agent 2 — Member Portal Polish**

| Step | File | Description |
|------|------|-------------|
| 2.1 | **NEW** `src/components/portal/PortalTabConfig.ts` | Define 4-tab config with i18n keys |
| 2.2 | [`src/app/[locale]/portal/layout.tsx`](../../src/app/[locale]/portal/layout.tsx) | Replace `PortalBottomNav` with `NativeTabBar` + `NativeHeader` + `PageTransition` |
| 2.3 | [`src/app/[locale]/portal/page.tsx`](../../src/app/[locale]/portal/page.tsx) | Use `getTranslations` for all strings |
| 2.4 | [`src/components/portal/PortalBottomNav.tsx`](../../src/components/portal/PortalBottomNav.tsx) | DELETE — replaced by shared primitive |

**Dependencies:** Phase 1 complete.

### Phase 3: Portal B — Coach App

**Agent 3 — Coach App Polish**

| Step | File | Description |
|------|------|-------------|
| 3.1 | **NEW** `src/components/coach/CoachTabConfig.ts` | Define 4-tab config with i18n keys |
| 3.2 | [`src/app/[locale]/coach/layout.tsx`](../../src/app/[locale]/coach/layout.tsx) | Replace `CoachBottomNav` with `NativeTabBar` + `NativeHeader` + `PageTransition` |
| 3.3 | [`src/app/[locale]/coach/page.tsx`](../../src/app/[locale]/coach/page.tsx) | Use `getTranslations` for all strings |
| 3.4 | [`src/components/coach/CoachBottomNav.tsx`](../../src/components/coach/CoachBottomNav.tsx) | DELETE — replaced by shared primitive |

**Dependencies:** Phase 1 complete. Can run in parallel with Phase 2.

### Phase 4: Portal A — Staff Dashboard (Most Complex)

**Agent 4 — Staff Dashboard Native Redesign**

| Step | File | Description |
|------|------|-------------|
| 4.1 | **NEW** `src/components/dashboard/DashboardTabBar.tsx` | Define 5-tab config + "More" sheet items, role-filtered |
| 4.2 | **NEW** `src/components/dashboard/MoreSheet.tsx` | SwipeableSheet with 9 secondary nav items |
| 4.3 | **NEW** `src/components/dashboard/DashboardMobileLayout.tsx` | Mobile wrapper: NativeHeader + PageTransition + NativeTabBar |
| 4.4 | [`src/app/[locale]/(dashboard)/layout.tsx`](../../src/app/[locale]/(dashboard)/layout.tsx) | Add responsive split (mobile tab bar / desktop sidebar) |
| 4.5 | [`src/components/layout/Header.tsx`](../../src/components/layout/Header.tsx) | Refactor to use NativeHeader, remove hamburger |
| 4.6 | [`src/components/layout/Sidebar.tsx`](../../src/components/layout/Sidebar.tsx) | Polish desktop sidebar (active indicators, hover states) |

**Dependencies:** Phase 1 complete. Can run in parallel with Phases 2 & 3.

### Phase 5: Integration & QA

| Step | Description |
|------|-------------|
| 5.1 | Verify all 3 portals render correctly on mobile (375px-768px) |
| 5.2 | Verify desktop Staff Dashboard sidebar still works (≥769px) |
| 5.3 | Test RTL layout for Arabic locale across all portals |
| 5.4 | Test i18n keys: switch between AR/EN/FR, verify tab labels |
| 5.5 | Test safe-area on iOS simulator (notch, Dynamic Island) |
| 5.6 | Test frosted glass effect on Safari (backdrop-filter support) |
| 5.7 | Test tab bounce animation on touch devices |
| 5.8 | Test "More" sheet open/close and navigation |
| 5.9 | Verify no regressions in existing (marketing) route group |

---

## 8. Parallel Agent Dispatch Map

```
┌─────────────────────────────────────────────────────────────────┐
│                    PARALLEL DISPATCH MAP                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PHASE 1 (Foundation) — Agent 1                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ design-tokens.ts  tailwind.config.ts  globals.css       │    │
│  │ NativeTabBar.tsx  NativeHeader.tsx                      │    │
│  │ SwipeableSheet.tsx  PageTransition.tsx                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                      │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │         PHASE 2 (Portal C)     PHASE 3 (Portal B)       │    │
│  │         PHASE 4 (Portal A)     ← ALL PARALLEL           │    │
│  │                                                          │    │
│  │  Agent 2: Portal C  │  Agent 3: Portal B  │ Agent 4: A  │    │
│  │  portal/layout.tsx  │  coach/layout.tsx   │ dashboard/   │    │
│  │  PortalTabConfig.ts │  CoachTabConfig.ts  │ MoreSheet    │    │
│  │  DELETE old nav     │  DELETE old nav     │ layout.tsx   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                      │
│                           ▼                                      │
│  PHASE 5 (Integration) — All agents verify                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ RTL test  │  i18n test  │  Safe area  │  Glass  │  Anim  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### File Conflict Matrix

| File | Agent 1 | Agent 2 | Agent 3 | Agent 4 |
|------|---------|---------|---------|---------|
| `src/lib/design-tokens.ts` | ✅ | — | — | — |
| `tailwind.config.ts` | ✅ | — | — | — |
| `src/app/globals.css` | ✅ | — | — | — |
| `src/components/native/*` | ✅ | — | — | — |
| `src/components/portal/*` | — | ✅ | — | — |
| `src/components/coach/*` | — | — | ✅ | — |
| `src/components/dashboard/*` | — | — | — | ✅ |
| `src/app/[locale]/portal/layout.tsx` | — | ✅ | — | — |
| `src/app/[locale]/coach/layout.tsx` | — | — | ✅ | — |
| `src/app/[locale]/(dashboard)/layout.tsx` | — | — | — | ✅ |
| `src/components/layout/Header.tsx` | — | — | — | ✅ |
| `src/components/layout/Sidebar.tsx` | — | — | — | ✅ |

**No file conflicts between agents.** Each agent touches only its own domain.

---

## Appendix A: Accessibility Requirements

1. All tab bars must have `role="tablist"` with `aria-label`
2. Each tab must have `role="tab"`, `aria-selected`, `aria-controls`
3. Tab panels must have `role="tabpanel"` with `aria-labelledby`
4. SwipeableSheet must have `role="dialog"`, `aria-modal="true"`, and a labelledby/trapping focus
5. Touch targets must be minimum 44x44px per Apple HIG
6. All icons must have `aria-hidden="true"` with text labels for screen readers
7. RTL: `dir="rtl"` on root, all animations/flips must respect direction
8. `prefers-reduced-motion` must disable all tab bounce and slide animations

---

## Appendix B: RTL Behavior Matrix

| Component | LTR Behavior | RTL Behavior |
|-----------|-------------|--------------|
| `NativeTabBar` | Tabs left-to-right, active indicator left-aligned | Tabs right-to-left, active indicator right-aligned |
| `NativeHeader` | Back arrow = chevron-left | Back arrow = chevron-right |
| `PageTransition` | Slide in from right, out to left | Slide in from left, out to right |
| `SwipeableSheet` | Drag handle centered, swipe down to dismiss | Same (vertical drag, unaffected by RTL) |
| `MoreSheet` items | List top-to-bottom, icons on left | List top-to-bottom, icons on right |

---

## Appendix C: Icon Reference

| Icon Name | Lucide Import | Used By |
|-----------|--------------|---------|
| `LayoutDashboard` | `lucide-react` | Staff Dashboard tab |
| `Users` | `lucide-react` | Students tab (all portals) |
| `Dumbbell` | `lucide-react` | Classes tab, PT Sessions |
| `Calendar` | `lucide-react` | Schedule tab (all portals) |
| `ClipboardList` | `lucide-react` | Attendance tab (Staff) |
| `ClipboardCheck` | `lucide-react` | Attendance tab (Coach) |
| `DollarSign` | `lucide-react` | Payments |
| `Receipt` | `lucide-react` | Invoices |
| `Building` | `lucide-react` | Rentals |
| `Tent` | `lucide-react` | Camps |
| `UserPlus` | `lucide-react` | Leads |
| `BarChart3` | `lucide-react` | Reports |
| `Settings` | `lucide-react` | Settings |
| `User` | `lucide-react` | Profile tab (all portals) |
| `CreditCard` | `lucide-react` | Billing tab (Member) |
| `Grid` | `lucide-react` | Home tab (Member) |
| `Ellipsis` | `lucide-react` | More tab (Staff) |
| `Bell` | `lucide-react` | Notification bell (Header) |
| `Languages` | `lucide-react` | Language switcher |
| `ChevronLeft` | `lucide-react` | Back button |
| `ChevronRight` | `lucide-react` | Back button (RTL) |