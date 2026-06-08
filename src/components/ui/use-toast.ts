'use client'

import * as React from 'react'

type ToastVariant = 'default' | 'destructive' | 'success'

interface Toast {
  id: string
  title?: string
  description?: string
  variant?: ToastVariant
}

interface ToastState {
  toasts: Toast[]
}

type ToastAction =
  | { type: 'ADD_TOAST'; toast: Toast }
  | { type: 'DISMISS_TOAST'; toastId: string }

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

function toast({
  title,
  description,
  variant = 'default',
}: {
  title?: string
  description?: string
  variant?: ToastVariant
}) {
  const id = genId()
  const newToast: Toast = { id, title, description, variant }
  
  dispatch({ type: 'ADD_TOAST', toast: newToast })
  
  const timeout = setTimeout(() => {
    dispatch({ type: 'DISMISS_TOAST', toastId: id })
    toastTimeouts.delete(id)
  }, 5000)
  
  toastTimeouts.set(id, timeout)
  
  return {
    id,
    dismiss: () => {
      dispatch({ type: 'DISMISS_TOAST', toastId: id })
      const timeout = toastTimeouts.get(id)
      if (timeout) {
        clearTimeout(timeout)
        toastTimeouts.delete(id)
      }
    },
  }
}

function reducer(state: ToastState, action: ToastAction): ToastState {
  switch (action.type) {
    case 'ADD_TOAST':
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, 5),
      }
    case 'DISMISS_TOAST':
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
    default:
      return state
  }
}

const listeners: Array<(state: ToastState) => void> = []
let memoryState: ToastState = { toasts: [] }

function dispatch(action: ToastAction) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => listener(memoryState))
}

function useToast() {
  const [state, setState] = React.useState<ToastState>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [])

  return {
    ...state,
    toast,
    dismiss: (toastId: string) => dispatch({ type: 'DISMISS_TOAST', toastId }),
  }
}

export { useToast, toast }
export type { Toast }
