'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function PrintButton({ label }: { label: string }) {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="print-btn">
      <Printer className="me-1 h-4 w-4" /> {label}
    </Button>
  )
}
