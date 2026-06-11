"use client"
import { useEffect, useRef, useState } from "react"
import type { WikiSuggestionState } from "./WikiLinkExtension"

interface SuggestionItem {
  id: string
  title: string
  authors?: string[]
  year?: number | null
  folder?: string
}

interface Props {
  state: WikiSuggestionState
  projectId: string
  onSelect: (item: SuggestionItem) => void
  onClose: () => void
}

export default function WikiLinkSuggestion({ state, projectId, onSelect, onClose }: Props) {
  const [results, setResults] = useState<SuggestionItem[]>([])
  const [idx, setIdx] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!state.active) { setResults([]); return }
    const token = localStorage.getItem("rb_token") ?? ""
    const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
    const endpoint = state.mode === "paper" ? "papers/search" : "docs/search"
    fetch(`${BASE}/api/projects/${projectId}/${endpoint}?q=${encodeURIComponent(state.query)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => { setResults(data); setIdx(0) })
      .catch(() => setResults([]))
  }, [state.query, state.active, state.mode, projectId])

  // Keyboard navigation forwarded from the editor
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!state.active || results.length === 0) return
      if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(i + 1, results.length - 1)) }
      if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)) }
      if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onSelect(results[idx]) }
      if (e.key === "Escape") { e.preventDefault(); onClose() }
    }
    window.addEventListener("keydown", handler, true)
    return () => window.removeEventListener("keydown", handler, true)
  }, [state.active, results, idx, onSelect, onClose])

  if (!state.active || !state.rect || results.length === 0) return null

  const style: React.CSSProperties = {
    position: "fixed",
    top: state.rect.bottom + 4,
    left: state.rect.left,
    zIndex: 1000,
  }

  return (
    <div ref={listRef} style={style}
      className="bg-white border rounded-xl shadow-xl w-80 overflow-hidden text-sm">
      {results.map((p, i) => (
        <button key={p.id}
          className={`w-full text-left px-3 py-2.5 flex items-start gap-2 ${i === idx ? "bg-blue-50" : "hover:bg-gray-50"}`}
          onMouseDown={e => { e.preventDefault(); onSelect(p) }}
          onMouseEnter={() => setIdx(i)}
        >
          <code className="text-[10px] text-gray-400 mt-0.5 flex-shrink-0 font-mono">
            {state.mode === "paper" ? `@${p.id.slice(0, 12)}` : "{{}}"}
          </code>
          <div className="min-w-0">
            <p className="font-medium text-xs line-clamp-1">{p.title}</p>
            <p className="text-xs text-gray-400 truncate">
              {state.mode === "paper"
                ? `${p.authors?.[0]?.split(",")[0] ?? ""} ${p.year ? `· ${p.year}` : ""}`
                : (p.folder ? `/${p.folder}` : "Document")}
            </p>
          </div>
        </button>
      ))}
    </div>
  )
}
