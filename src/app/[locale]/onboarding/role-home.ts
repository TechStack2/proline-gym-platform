/** The post-onboarding landing per role (no locale prefix — caller adds it). */
export function roleHomePath(role: string | null | undefined): string {
  switch (role) {
    case 'coach':
    case 'head_coach':
    case 'external_coach':
      return '/coach'
    case 'student':
    case 'parent':
      return '/portal'
    default: // owner / receptionist
      return '/today'
  }
}
