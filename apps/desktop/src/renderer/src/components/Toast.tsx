import { RotateCcw } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

// 02 §0·§12: 아래 가운데 둥근 사각 토스트(모서리 8) + 주황 되돌리기 아이콘(약 2초). 02 §7: Cmd/Ctrl+Z는 마지막 동작을 되돌린다.
type Undo = () => unknown
type Toast = { id: number; message: string; undo?: Undo }
type Ctx = { show: (message: string, undo?: Undo) => void; undoLast: () => boolean; registerUndo: (undo: Undo) => void }
const ToastCtx = createContext<Ctx>({ show: () => {}, undoLast: () => false, registerUndo: () => {} })
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast>()
  const timer = useRef<number>(undefined)
  const last = useRef<Undo>(undefined)
  const show = useCallback((message: string, undo?: Undo) => {
    window.clearTimeout(timer.current)
    last.current = undo
    setToast({ id: Date.now(), message, undo })
    timer.current = window.setTimeout(() => setToast(undefined), 2000)
  }, [])
  const undoLast = useCallback(() => {
    const undo = last.current
    if (!undo) return false
    last.current = undefined
    setToast(undefined)
    void undo()
    return true
  }, [])
  // 토스트 없이 Cmd+Z로만 되돌릴 수 있게 등록(상세에서 바로 고친 값 등)
  const registerUndo = useCallback((undo: Undo) => { last.current = undo }, [])
  const value = useMemo(() => ({ show, undoLast, registerUndo }), [show, undoLast, registerUndo])
  return (
    <ToastCtx.Provider value={value}>
      {children}
      {toast && (
        <div className="toast" key={toast.id} role="status">
          <span>{toast.message}</span>
          {toast.undo && (
            <button className="toast__undo" onClick={undoLast} aria-label="되돌리기">
              <RotateCcw />
            </button>
          )}
        </div>
      )}
    </ToastCtx.Provider>
  )
}
