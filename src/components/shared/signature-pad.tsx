'use client'

/**
 * F3 — touch-first signature pad. Pointer events cover mouse / touch / pen
 * (front-desk tablet or the member's phone). `touch-action: none` keeps a draw
 * stroke from scrolling the sheet. Emits a PNG data-URL on each stroke end (and
 * '' on clear) — the parent owns the value. Presentation only.
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Eraser } from 'lucide-react'

export function SignaturePad({
  onChange, testid = 'signature-pad',
}: {
  onChange: (dataUrl: string) => void
  testid?: string
}) {
  const t = useTranslations('waiver')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const dirty = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
  }, [])

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    dirty.current = true
  }
  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    if (dirty.current) {
      setHasInk(true)
      onChange(canvasRef.current!.toDataURL('image/png'))
    }
  }
  const clear = () => {
    const canvas = canvasRef.current!
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    dirty.current = false
    setHasInk(false)
    onChange('')
  }

  return (
    <div className="space-y-1.5">
      <div className="relative rounded-xl border-2 border-dashed border-gray-300 bg-gray-50">
        <canvas
          ref={canvasRef}
          width={520}
          height={180}
          data-testid={testid}
          data-has-ink={hasInk}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          className="h-[180px] w-full rounded-xl touch-none"
        />
        {!hasInk && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-gray-400">
            {t('drawHere')}
          </span>
        )}
      </div>
      <button type="button" onClick={clear} data-testid="signature-clear"
        className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700">
        <Eraser className="h-3 w-3" /> {t('clear')}
      </button>
    </div>
  )
}
