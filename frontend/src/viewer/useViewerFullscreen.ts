import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/** Mantiene el visor montado al ampliar; la alternativa CSS cubre navegadores sin Fullscreen API. */
export function useViewerFullscreen(container: RefObject<HTMLElement | null>) {
  const [native, setNative] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const previousFocus = useRef<HTMLElement | null>(null)
  const fullscreen = native || expanded

  useEffect(() => {
    const changed = () => setNative(document.fullscreenElement === container.current)
    document.addEventListener('fullscreenchange', changed)
    const element = container.current
    return () => {
      document.removeEventListener('fullscreenchange', changed)
      if (element && document.fullscreenElement === element) void document.exitFullscreen().catch(() => {})
    }
  }, [container])

  useEffect(() => {
    if (!fullscreen) return
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.classList.add('panorama-fullscreen-open')
    container.current?.querySelector<HTMLButtonElement>('.viewer-expand')?.focus({ preventScroll: true })
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && expanded) {
        event.preventDefault(); event.stopPropagation(); setExpanded(false)
      }
      if (event.key !== 'Tab') return
      const elements = [...(container.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]') || [])]
        .filter(element => element.getClientRects().length > 0)
      const first = elements[0], last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', keydown, true)
    return () => {
      window.removeEventListener('keydown', keydown, true)
      document.body.style.overflow = overflow
      document.body.classList.remove('panorama-fullscreen-open')
      if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true })
    }
  }, [fullscreen, expanded, container])

  async function toggle() {
    if (native) { await document.exitFullscreen(); return }
    if (expanded) { setExpanded(false); return }
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (document.fullscreenEnabled && container.current?.requestFullscreen) {
      try { await container.current.requestFullscreen(); return } catch { /* Ampliar dentro de la página si el navegador o iframe deniega la API. */ }
    }
    setExpanded(true)
  }

  return { fullscreen, toggle }
}
