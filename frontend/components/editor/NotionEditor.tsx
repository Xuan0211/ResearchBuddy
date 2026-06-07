"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { Mark, mergeAttributes } from "@tiptap/core"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import Typography from "@tiptap/extension-typography"
import Image from "@tiptap/extension-image"
import Underline from "@tiptap/extension-underline"
import { Markdown } from "tiptap-markdown"
import dynamic from "next/dynamic"
import { WikiLinkExtension, type WikiSuggestionState } from "./WikiLinkExtension"
import WikiLinkSuggestion from "./WikiLinkSuggestion"
import "./notion-editor.css"

const PaperPeekPanel = dynamic(() => import("../paper/PaperPeekPanel"), { ssr: false })

const ResearchBuddyAnnotation = Mark.create({
  name: "rbAnnotation",

  addAttributes() {
    return {
      tone: {
        default: "red",
        parseHTML: element => element.getAttribute("data-rb-tone") || "red",
        renderHTML: attributes => ({ "data-rb-tone": attributes.tone }),
      },
      underline: {
        default: false,
        parseHTML: element => element.getAttribute("data-rb-underline") === "true",
        renderHTML: attributes => attributes.underline ? { "data-rb-underline": "true" } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-rb-tone]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "rb-annotation" }), 0]
  },

  addStorage() {
    return {
      markdown: {
        serialize: {
          open(_state: unknown, mark: any) {
            const tone = mark.attrs.tone || "red"
            const underline = mark.attrs.underline ? " data-rb-underline=\"true\"" : ""
            return `<span data-rb-tone="${tone}"${underline}>`
          },
          close() {
            return "</span>"
          },
        },
        parse: {},
      },
    }
  },
})

interface Props {
  content: string
  onChange?: (markdown: string) => void
  onSave?: (markdown: string) => void
  placeholder?: string
  saveDelay?: number
  readOnly?: boolean
  projectId?: string
}

export default function NotionEditor({
  content, onChange, onSave,
  placeholder = "Start writing…",
  saveDelay = 1200, readOnly = false, projectId,
}: Props) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastSaved = useRef<string>(content)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const [suggestionState, setSuggestionState] = useState<WikiSuggestionState>({
    active: false, query: "", range: { from: 0, to: 0 }, rect: null,
  })

  // Peek panel state
  const [peekPaperId, setPeekPaperId] = useState<string | null>(null)

  // Hover card state
  const [hoverCard, setHoverCard] = useState<{ paperId: string; x: number; y: number } | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const handleSuggestionState = useCallback((s: WikiSuggestionState) => setSuggestionState(s), [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: { languageClassPrefix: "language-" } }),
      Underline,
      ResearchBuddyAnnotation,
      Markdown.configure({ html: true, transformPastedText: true }),
      Placeholder.configure({ placeholder }),
      Typography,
      Image.configure({ inline: false, allowBase64: false }),
      WikiLinkExtension(handleSuggestionState),
    ],
    content,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      const md = (editor.storage as any).markdown.getMarkdown()
      onChange?.(md)
      if (onSave) {
        clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(() => {
          if (md !== lastSaved.current) { lastSaved.current = md; onSave(md) }
        }, saveDelay)
      }
    },
  })

  useEffect(() => {
    if (!editor) return
    const current = (editor.storage as any).markdown.getMarkdown()
    if (content !== current && content !== lastSaved.current) {
      editor.commands.setContent(content); lastSaved.current = content
    }
  }, [content, editor])

  // Image paste from clipboard
  useEffect(() => {
    if (!editor || !projectId) return
    const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
    const handlePaste = async (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? [])
      const imageItems = items.filter(item => item.type.startsWith("image/"))
      if (imageItems.length === 0) return
      e.preventDefault()
      for (const item of imageItems) {
        const file = item.getAsFile()
        if (!file) continue
        try {
          const form = new FormData()
          form.append("file", file)
          const token = localStorage.getItem("rb_token") ?? ""
          const res = await fetch(`${BASE}/api/projects/${projectId}/media/images`, {
            method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
          })
          if (!res.ok) continue
          const { url } = await res.json()
          editor.chain().focus().setImage({ src: `${BASE}${url}` }).run()
        } catch {}
      }
    }
    const el = editor.view.dom
    el.addEventListener("paste", handlePaste)
    return () => el.removeEventListener("paste", handlePaste)
  }, [editor, projectId])

  // Wiki-link click → peek panel
  useEffect(() => {
    const el = wrapperRef.current
    if (!el || !projectId) return
    const handleClick = (e: MouseEvent) => {
      const span = (e.target as HTMLElement).closest<HTMLElement>("[data-paper-id]")
      if (!span) return
      e.preventDefault(); e.stopPropagation()
      setPeekPaperId(span.dataset.paperId ?? null)
    }
    const handleMouseEnter = (e: MouseEvent) => {
      const span = (e.target as HTMLElement).closest<HTMLElement>("[data-paper-id]")
      if (!span) return
      clearTimeout(hoverTimer.current)
      const rect = span.getBoundingClientRect()
      hoverTimer.current = setTimeout(() => {
        setHoverCard({ paperId: span.dataset.paperId!, x: rect.left, y: rect.bottom + 6 })
      }, 350)
    }
    const handleMouseLeave = (e: MouseEvent) => {
      const span = (e.target as HTMLElement).closest<HTMLElement>("[data-paper-id]")
      if (!span) return
      clearTimeout(hoverTimer.current)
      // Small delay so the card itself can be entered
      hoverTimer.current = setTimeout(() => setHoverCard(null), 250)
    }
    el.addEventListener("click", handleClick, true)
    el.addEventListener("mouseover", handleMouseEnter)
    el.addEventListener("mouseout", handleMouseLeave)
    return () => {
      el.removeEventListener("click", handleClick, true)
      el.removeEventListener("mouseover", handleMouseEnter)
      el.removeEventListener("mouseout", handleMouseLeave)
    }
  }, [projectId])

  function handleSelectPaper(paper: { id: string }) {
    if (!editor) return
    const { from, to } = suggestionState.range
    editor.chain().focus().deleteRange({ from, to }).insertContent(`[[${paper.id}]]`).run()
    setSuggestionState(s => ({ ...s, active: false }))
  }

  function applyTone(tone: "red" | "yellow" | "gray") {
    if (!editor) return
    editor.chain().focus().setMark("rbAnnotation", { tone }).run()
  }

  function applyUnderline() {
    if (!editor) return
    editor.chain().focus().toggleUnderline().run()
  }

  function clearMarks() {
    if (!editor) return
    editor.chain().focus().unsetMark("rbAnnotation").unsetUnderline().run()
  }

  return (
    <div ref={wrapperRef} className="relative">
      {!readOnly && editor && (
        <div className="sticky top-0 z-10 flex items-center gap-1 border-b bg-white px-4 py-2">
          <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}
            className={`rounded-md border px-2 py-1 text-xs ${editor.isActive("bold") ? "bg-gray-950 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
            B
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`rounded-md border px-2 py-1 text-xs italic ${editor.isActive("italic") ? "bg-gray-950 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
            I
          </button>
          <button type="button" onClick={applyUnderline}
            className={`rounded-md border px-2 py-1 text-xs underline ${editor.isActive("underline") ? "bg-gray-950 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
            U
          </button>
          <span className="mx-1 h-5 w-px bg-gray-200" />
          <button type="button" onClick={() => applyTone("red")} title="Mark red"
            className="h-7 w-7 rounded-md border border-red-200 bg-red-50 text-xs text-red-700 hover:bg-red-100">
            A
          </button>
          <button type="button" onClick={() => applyTone("yellow")} title="Highlight yellow"
            className="h-7 w-7 rounded-md border border-yellow-200 bg-yellow-100 text-xs text-yellow-800 hover:bg-yellow-200">
            A
          </button>
          <button type="button" onClick={() => applyTone("gray")} title="Mark gray"
            className="h-7 w-7 rounded-md border border-gray-200 bg-gray-100 text-xs text-gray-600 hover:bg-gray-200">
            A
          </button>
          <button type="button" onClick={clearMarks}
            className="rounded-md border px-2 py-1 text-xs text-gray-500 hover:bg-gray-50">
            Clear
          </button>
        </div>
      )}
      <EditorContent editor={editor} className="notion-editor" />

      {projectId && (
        <WikiLinkSuggestion
          state={suggestionState}
          projectId={projectId}
          onSelect={handleSelectPaper}
          onClose={() => setSuggestionState(s => ({ ...s, active: false }))}
        />
      )}

      {/* Hover mini-card */}
      {hoverCard && projectId && (
        <WikiLinkHoverCard
          paperId={hoverCard.paperId}
          projectId={projectId}
          x={hoverCard.x}
          y={hoverCard.y}
          onMouseEnter={() => clearTimeout(hoverTimer.current)}
          onMouseLeave={() => { clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => setHoverCard(null), 150) }}
          onClick={() => { setHoverCard(null); setPeekPaperId(hoverCard.paperId) }}
        />
      )}

      {/* Peek panel */}
      {peekPaperId && projectId && (
        <PaperPeekPanel
          paperId={peekPaperId}
          projectId={projectId}
          onClose={() => setPeekPaperId(null)}
        />
      )}
    </div>
  )
}

// ── Inline hover mini-card ──────────────────────────────────────────────────

import { api } from "@/lib/api"
import type { Paper } from "@/lib/types"
import { ExternalLink } from "lucide-react"

function WikiLinkHoverCard({ paperId, projectId, x, y, onMouseEnter, onMouseLeave, onClick }: {
  paperId: string; projectId: string; x: number; y: number
  onMouseEnter: () => void; onMouseLeave: () => void; onClick: () => void
}) {
  const [paper, setPaper] = useState<Pick<Paper, "title" | "authors" | "year" | "venue"> | null>(null)

  useEffect(() => {
    api.get<Paper>(`/api/projects/${projectId}/papers/${paperId}`)
      .then(p => setPaper({ title: p.title, authors: p.authors, year: p.year, venue: p.venue }))
      .catch(() => {})
  }, [paperId, projectId])

  return (
    <div
      style={{ position: "fixed", left: x, top: y, zIndex: 999 }}
      className="bg-white border rounded-xl shadow-lg p-3 w-72 text-xs"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      {paper ? (
        <div className="space-y-1 cursor-pointer">
          <p className="font-medium leading-snug line-clamp-2">{paper.title}</p>
          <p className="text-gray-500">
            {paper.authors?.[0]?.split(",")[0]}
            {(paper.authors?.length ?? 0) > 1 ? " et al." : ""}
            {paper.year ? ` · ${paper.year}` : ""}
            {paper.venue ? ` · ${paper.venue}` : ""}
          </p>
          <p className="text-blue-600 flex items-center gap-1">Click to preview <ExternalLink size={10} /></p>
        </div>
      ) : (
        <p className="text-gray-400">[[{paperId}]]</p>
      )}
    </div>
  )
}
