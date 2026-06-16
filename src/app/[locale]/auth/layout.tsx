type Props = {
  children: React.ReactNode;
};

/**
 * Auth route layout — a PASS-THROUGH.
 *
 * The locale root layout (`src/app/[locale]/layout.tsx`) already renders the
 * single `<html>`/`<body>`, the latin/arabic fonts, and `NextIntlClientProvider`
 * for the whole tree. This nested layout must NOT render its own `<html>`/`<body>`:
 * doing so emitted a SECOND `<html><body>` inside the first (invalid DOM →
 * "<html> cannot be a child of <body>"), which corrupted hydration and threw
 * `NotFoundError: removeChild` when React tore the auth subtree down on the
 * auth → app navigation (every login). Auth pages inherit fonts + i18n from root.
 */
export default function AuthLayout({ children }: Props) {
  return <>{children}</>;
}
