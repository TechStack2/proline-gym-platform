/**
 * MEMBER-360-ACTIONABLE §3.2 — the needs-attention queue, DERIVED at render,
 * never stored. Rules are mechanical (binding spec): renewal past due · open
 * invoice aging > 7d · PT package expiring < 14d or ≤ 2 sessions left · no
 * attendance in 14d → win-back. Thresholds ship as named constants (per-gym
 * settings later if asked). Pure over rows the page already loads — no reads.
 */

import { daysPastDue } from '@/lib/finances/aging'

export const ATTENTION = {
  /** an open invoice older than this many days past due queues a reminder */
  INVOICE_AGING_DAYS: 7,
  /** a PT package expiring within this window queues a booking nudge */
  PT_EXPIRY_DAYS: 14,
  /** …or with this many (or fewer) unused sessions near expiry semantics */
  PT_LOW_SESSIONS: 2,
  /** no attendance for this many days queues the win-back row */
  ABSENCE_WINBACK_DAYS: 14,
} as const

export type AttentionItem =
  | {
      kind: 'renewal'
      severity: 'danger'
      /** the product the renewal belongs to (localized by the caller) */
      productLabel: string
      dueDate: string
      overdueDays: number
      /** open renewal/product invoice to collect against — null ⇒ fall back to the card anchor */
      collectInvoiceId: string | null
      anchor: string
    }
  | {
      kind: 'invoice'
      severity: 'warning'
      invoiceId: string
      invoiceNumber: string
      ageDays: number
      balanceUsd: number
    }
  | {
      kind: 'pt'
      severity: 'info'
      assignmentId: string
      packageLabel: string
      expiresAt: string | null
      sessionsRemaining: number
      sessionsTotal: number
      reason: 'expiring' | 'low'
    }
  | {
      kind: 'winback'
      severity: 'info'
      lastSeen: string | null
      absentDays: number | null
    }

export type AttentionInputs = {
  /** products currently in a past-due renewal state (the caller computes lifecycle state) */
  overdueRenewals: { productLabel: string; dueDate: string; collectInvoiceId: string | null; anchor: string }[]
  openInvoices: { id: string; invoiceNumber: string; dueDate: string | null; balanceUsd: number }[]
  ptAssignments: {
    id: string
    packageLabel: string
    expiresAt: string | null
    sessionsRemaining: number
    sessionsTotal: number
    isActive: boolean
  }[]
  lastSeen: string | null
  joinDate: string | null
  today?: Date
}

const daysSince = (iso: string | null, today: Date): number | null => {
  if (!iso) return null
  const then = new Date(String(iso).slice(0, 10) + 'T00:00:00Z')
  const now = new Date(today.toISOString().slice(0, 10) + 'T00:00:00Z')
  return Math.floor((now.getTime() - then.getTime()) / 864e5)
}

export function deriveMemberAttention(inputs: AttentionInputs): AttentionItem[] {
  const today = inputs.today ?? new Date()
  const items: AttentionItem[] = []

  for (const r of inputs.overdueRenewals) {
    items.push({
      kind: 'renewal',
      severity: 'danger',
      productLabel: r.productLabel,
      dueDate: r.dueDate,
      overdueDays: daysPastDue(r.dueDate, today),
      collectInvoiceId: r.collectInvoiceId,
      anchor: r.anchor,
    })
  }

  for (const inv of inputs.openInvoices) {
    const age = daysPastDue(inv.dueDate, today)
    if (age > ATTENTION.INVOICE_AGING_DAYS && inv.balanceUsd > 0.005) {
      items.push({
        kind: 'invoice',
        severity: 'warning',
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        ageDays: age,
        balanceUsd: inv.balanceUsd,
      })
    }
  }

  for (const pt of inputs.ptAssignments) {
    if (!pt.isActive || pt.sessionsRemaining <= 0) continue
    // days from today to expiry (daysSince is negative for a future date)
    const ahead = pt.expiresAt ? -(daysSince(pt.expiresAt, today) ?? 0) : null
    const expiring = ahead != null && ahead >= 0 && ahead < ATTENTION.PT_EXPIRY_DAYS
    const low = pt.sessionsRemaining <= ATTENTION.PT_LOW_SESSIONS
    if (expiring || low) {
      items.push({
        kind: 'pt',
        severity: 'info',
        assignmentId: pt.id,
        packageLabel: pt.packageLabel,
        expiresAt: pt.expiresAt,
        sessionsRemaining: pt.sessionsRemaining,
        sessionsTotal: pt.sessionsTotal,
        reason: expiring ? 'expiring' : 'low',
      })
    }
  }

  const absent = daysSince(inputs.lastSeen, today)
  const sinceJoin = daysSince(inputs.joinDate, today)
  // Never-seen counts once they have been a member longer than the window —
  // absence is information, a brand-new signup is not.
  const winback =
    (absent != null && absent >= ATTENTION.ABSENCE_WINBACK_DAYS) ||
    (absent == null && sinceJoin != null && sinceJoin >= ATTENTION.ABSENCE_WINBACK_DAYS)
  if (winback) {
    items.push({ kind: 'winback', severity: 'info', lastSeen: inputs.lastSeen, absentDays: absent })
  }

  return items
}
