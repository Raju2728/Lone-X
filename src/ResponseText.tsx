import { useEffect, useLayoutEffect, useRef, useState } from 'react'

type Part = { text: string; fade: boolean }

export default function ResponseText({ text, streaming, onReveal }: { text: string; streaming: boolean; onReveal: () => void }) {
  const [parts, setParts] = useState<Part[]>(() => streaming ? [] : [{ text, fade: false }])
  const latest = useRef(text)
  const shown = useRef(streaming ? '' : text)
  const wasStreaming = useRef(streaming)
  latest.current = text

  useEffect(() => {
    if (!streaming) return
    const interval = window.setInterval(() => {
      const current = latest.current
      if (!current.startsWith(shown.current)) {
        shown.current = ''
        setParts([])
      }
      const remaining = current.slice(shown.current.length)
      // Reveal complete words together instead of advancing a character cursor.
      const boundary = Math.max(remaining.lastIndexOf(' '), remaining.lastIndexOf('\n'), remaining.lastIndexOf('\t')) + 1
      const next = boundary ? remaining.slice(0, boundary) : remaining.length >= 32 ? remaining : ''
      if (next) {
        shown.current += next
        setParts(previous => [...previous, { text: next, fade: true }])
      }
    }, 120)
    return () => window.clearInterval(interval)
  }, [streaming])

  useLayoutEffect(() => {
    if (!streaming) {
      if (wasStreaming.current && text.startsWith(shown.current)) {
        const rest = text.slice(shown.current.length)
        if (rest) setParts(previous => [...previous, { text: rest, fade: true }])
      } else setParts([{ text, fade: false }])
      shown.current = text
    }
    wasStreaming.current = streaming
  }, [text, streaming])

  useLayoutEffect(onReveal, [parts, onReveal])

  return <p className="ai-response-text">{parts.map((part, index) => <span key={index} className={part.fade ? 'ai-response-reveal' : undefined}>{part.text}</span>)}</p>
}
