"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { Mark, Node, mergeAttributes } from "@tiptap/core"
import { useEditor, EditorContent, NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import Typography from "@tiptap/extension-typography"
import Image from "@tiptap/extension-image"
import Underline from "@tiptap/extension-underline"
import Link from "@tiptap/extension-link"
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table"
import { Markdown } from "tiptap-markdown"
import { defaultMarkdownSerializer } from "prosemirror-markdown"
import dynamic from "next/dynamic"
import katex from "katex"
import { WikiLinkExtension, type WikiSuggestionState } from "./WikiLinkExtension"
import WikiLinkSuggestion from "./WikiLinkSuggestion"
import "./notion-editor.css"

const PaperPeekPanel = dynamic(() => import("../paper/PaperPeekPanel"), { ssr: false })

function escapeHtmlAttr(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function escapeHtmlText(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

function findClosingDollar(src: string, start: number) {
  for (let i = start; i < src.length; i += 1) {
    if (src[i] === "$" && src[i - 1] !== "\\") return i
  }
  return -1
}

const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: element => element.getAttribute("data-rb-width") || element.style.width || null,
        renderHTML: attributes => {
          if (!attributes.width) return {}
          return {
            "data-rb-width": attributes.width,
            style: `width:${attributes.width};height:auto;`,
          }
        },
      },
    }
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any, parent: any, index: number) {
          const width = node.attrs.width
          if (!width) {
            defaultMarkdownSerializer.nodes.image(state, node, parent, index)
            return
          }
          const src = escapeHtmlAttr(node.attrs.src || "")
          const alt = escapeHtmlAttr(node.attrs.alt || "")
          const title = node.attrs.title ? ` title="${escapeHtmlAttr(node.attrs.title)}"` : ""
          const style = `width:${escapeHtmlAttr(width)};height:auto;`
          state.write(`<img src="${src}" alt="${alt}"${title} data-rb-width="${escapeHtmlAttr(width)}" style="${style}">`)
          state.closeBlock(node)
        },
        parse: {},
      },
    }
  },
})

const ResearchBuddyMath = Node.create({
  name: "rbMath",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: element => element.getAttribute("data-latex") || element.textContent?.replace(/^\$+|\$+$/g, "") || "",
        renderHTML: attributes => ({ "data-latex": attributes.latex }),
      },
      display: {
        default: false,
        parseHTML: element => element.getAttribute("data-rb-math") === "block",
        renderHTML: attributes => ({ "data-rb-math": attributes.display ? "block" : "inline" }),
      },
    }
  },

  parseHTML() {
    return [
      { tag: "span[data-rb-math]" },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "rb-math" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathNodeView)
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const latex = node.attrs.latex || ""
          const display = Boolean(node.attrs.display)
          if (display) {
            state.write(`$$\n${latex}\n$$`)
          } else {
            state.write(`$${latex}$`)
          }
        },
        parse: {
          setup(markdownit: any) {
            markdownit.inline.ruler.before("escape", "rb_math_inline", (state: any, silent: boolean) => {
              const start = state.pos
              if (state.src.charCodeAt(start) !== 0x24 || state.src[start + 1] === "$") return false
              const end = findClosingDollar(state.src, start + 1)
              if (end < 0) return false
              const latex = state.src.slice(start + 1, end)
              if (!latex.trim()) return false
              if (!silent) {
                const token = state.push("rb_math_inline", "span", 0)
                token.content = latex
              }
              state.pos = end + 1
              return true
            })
            markdownit.renderer.rules.rb_math_inline = (tokens: any[], idx: number) => {
              const latex = tokens[idx].content || ""
              return `<span data-rb-math="inline" data-latex="${escapeHtmlAttr(latex)}">$${escapeHtmlText(latex)}$</span>`
            }

            markdownit.block.ruler.before("fence", "rb_math_block", (state: any, startLine: number, endLine: number, silent: boolean) => {
              const startPos = state.bMarks[startLine] + state.tShift[startLine]
              const max = state.eMarks[startLine]
              const firstLine = state.src.slice(startPos, max).trim()
              if (!firstLine.startsWith("$$")) return false

              const inlineMatch = firstLine.match(/^\$\$(.+)\$\$$/)
              if (inlineMatch) {
                if (!silent) {
                  const token = state.push("rb_math_block", "div", 0)
                  token.content = inlineMatch[1].trim()
                }
                state.line = startLine + 1
                return true
              }

              const lines: string[] = []
              let nextLine = startLine + 1
              for (; nextLine < endLine; nextLine += 1) {
                const pos = state.bMarks[nextLine] + state.tShift[nextLine]
                const line = state.src.slice(pos, state.eMarks[nextLine])
                if (line.trim() === "$$") break
                lines.push(line)
              }
              if (nextLine >= endLine) return false
              if (!silent) {
                const token = state.push("rb_math_block", "div", 0)
                token.block = true
                token.content = lines.join("\n").trim()
              }
              state.line = nextLine + 1
              return true
            })
            markdownit.renderer.rules.rb_math_block = (tokens: any[], idx: number) => {
              const latex = tokens[idx].content || ""
              return `<span data-rb-math="block" data-latex="${escapeHtmlAttr(latex)}">$$${escapeHtmlText(latex)}$$</span>`
            }
          },
        },
      },
    }
  },
})

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

const CALLOUT_STYLES: Record<string, { emoji: string; label: string; bg: string; border: string }> = {
  note:    { emoji: "💡", label: "Note",    bg: "#eff6ff", border: "#3b82f6" },
  tip:     { emoji: "✅", label: "Tip",     bg: "#f0fdf4", border: "#22c55e" },
  warning: { emoji: "⚠️", label: "Warning", bg: "#fffbeb", border: "#f59e0b" },
  danger:  { emoji: "🚨", label: "Danger",  bg: "#fef2f2", border: "#ef4444" },
}

function CalloutNodeView({ node, updateAttributes, deleteNode }: any) {
  const type: string = node.attrs.type || "note"
  const cfg = CALLOUT_STYLES[type] ?? CALLOUT_STYLES.note
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return
    function h(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as globalThis.Node)) setShowMenu(false)
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [showMenu])

  return (
    <NodeViewWrapper as="div" className="rb-callout-wrapper">
      <div
        className="rb-callout group"
        style={{ background: cfg.bg, borderLeftColor: cfg.border }}
      >
        {/* emoji type picker */}
        <div ref={menuRef} className="rb-callout-emoji-wrap" contentEditable={false}>
          <button
            type="button"
            className="rb-callout-emoji"
            title={`Type: ${cfg.label} — click to change`}
            onClick={() => setShowMenu(v => !v)}
          >
            {cfg.emoji}
          </button>
          {showMenu && (
            <div className="rb-callout-menu">
              {Object.entries(CALLOUT_STYLES).map(([t, s]) => (
                <button
                  key={t}
                  type="button"
                  title={s.label}
                  className={`rb-callout-menu-btn${t === type ? " active" : ""}`}
                  onClick={() => { updateAttributes({ type: t }); setShowMenu(false) }}
                >
                  {s.emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* editable content */}
        <NodeViewContent className="rb-callout-content" />

        {/* delete button — appears on hover */}
        <button
          type="button"
          contentEditable={false}
          className="rb-callout-delete"
          title="Delete callout"
          onClick={deleteNode}
        >
          ×
        </button>
      </div>
    </NodeViewWrapper>
  )
}

const CalloutExtension = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  selectable: true,

  addAttributes() {
    return {
      type: { default: "note" },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-callout-type]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, {
      class: "rb-callout",
      "data-callout-type": HTMLAttributes.type,
    }), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutNodeView)
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`:::${node.attrs.type}\n`)
          state.renderContent(node)
          state.write(":::")
          state.closeBlock(node)
        },
        parse: {
          setup(markdownit: any) {
            markdownit.block.ruler.before("fence", "rb_callout", (state: any, startLine: number, endLine: number, silent: boolean) => {
              const pos = state.bMarks[startLine] + state.tShift[startLine]
              const line = state.src.slice(pos, state.eMarks[startLine]).trim()
              const m = /^:::(note|tip|warning|danger)\s*$/.exec(line)
              if (!m) return false
              if (silent) return true
              let nextLine = startLine + 1
              while (nextLine < endLine) {
                const lpos = state.bMarks[nextLine] + state.tShift[nextLine]
                if (state.src.slice(lpos, state.eMarks[nextLine]).trim() === ":::") break
                nextLine++
              }
              if (nextLine >= endLine) return false
              const openToken = state.push("rb_callout_open", "div", 1)
              openToken.attrSet("data-callout-type", m[1])
              openToken.map = [startLine, nextLine + 1]
              openToken.markup = `:::${m[1]}`
              openToken.block = true
              state.md.block.tokenize(state, startLine + 1, nextLine)
              const closeToken = state.push("rb_callout_close", "div", -1)
              closeToken.markup = ":::"
              closeToken.block = true
              state.line = nextLine + 1
              return true
            })
          },
        },
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
    active: false, mode: "paper", query: "", range: { from: 0, to: 0 }, rect: null,
  })
  const docIndexRef = useRef<Map<string, { title: string; folder?: string }>>(new Map())

  // Peek panel state
  const [peekPaperId, setPeekPaperId] = useState<string | null>(null)

  // Hover card state
  const [hoverCard, setHoverCard] = useState<{ paperId: string; x: number; y: number } | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const handleSuggestionState = useCallback((s: WikiSuggestionState) => setSuggestionState(s), [])
  const resolveDocRef = useCallback((id: string, title?: string) => {
    const found = docIndexRef.current.get(id)
    return found
      ? { label: found.title || title || id, missing: false }
      : { label: title || id, missing: true }
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: { languageClassPrefix: "language-" }, link: false }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      ResearchBuddyAnnotation,
      CalloutExtension,
      ResearchBuddyMath,
      Markdown.configure({ html: true, transformPastedText: true }),
      Placeholder.configure({ placeholder }),
      Typography,
      ResizableImage.configure({ inline: false, allowBase64: false }),
      WikiLinkExtension(handleSuggestionState, resolveDocRef),
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

  useEffect(() => {
    if (!projectId || !editor) return
    api.get<Array<{ id: string; title: string; folder?: string }>>(`/api/projects/${projectId}/docs/search`)
      .then(docs => {
        docIndexRef.current = new Map(docs.map(doc => [doc.id, { title: doc.title, folder: doc.folder }]))
        editor.view.dispatch(editor.state.tr)
      })
      .catch(() => {})
  }, [projectId, editor])

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
      const target = e.target as HTMLElement
      const docSpan = target.closest<HTMLElement>("[data-doc-id]")
      if (docSpan) {
        e.preventDefault(); e.stopPropagation()
        const docId = docSpan.dataset.docId
        if (docId && !docSpan.classList.contains("is-missing")) {
          window.location.href = `/projects/${projectId}/docs/${docId}`
        }
        return
      }
      const span = target.closest<HTMLElement>("[data-paper-id]")
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
    if (suggestionState.mode === "doc") {
      const title = (paper as any).title || paper.id
      editor.chain().focus().deleteRange({ from, to }).insertContent(`{{${paper.id}|${title}}} `).run()
    } else {
      editor.chain().focus().deleteRange({ from, to }).insertContent(`[[${paper.id}]] `).run()
    }
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

  function setImageWidth(width: string) {
    if (!editor) return
    editor.chain().focus().updateAttributes("image", { width }).run()
  }

  function insertTable() {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }

  function deleteSelectedMath() {
    if (!editor || !editor.isActive("rbMath")) return
    editor.chain().focus().deleteSelection().run()
  }

  function insertLink() {
    if (!editor) return
    const previousUrl = editor.getAttributes("link").href || ""
    const url = window.prompt("Link URL", previousUrl)
    if (url === null) return
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run()
  }

  function insertMath(display = false) {
    if (!editor) return
    const latex = window.prompt("LaTeX formula", display ? "\\int_a^b f(x)\\,dx" : "x_i")
    if (!latex?.trim()) return
    editor.chain().focus().insertContent({ type: "rbMath", attrs: { latex: latex.trim(), display } }).run()
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
          <span className="mx-1 h-5 w-px bg-gray-200" />
          <button type="button" onClick={insertLink}
            className={`rounded-md border px-2 py-1 text-xs ${editor.isActive("link") ? "bg-gray-950 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
            Link
          </button>
          <button type="button" onClick={insertTable}
            className="rounded-md border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
            Table
          </button>
          {editor.isActive("table") && (
            <>
              <button type="button" onClick={() => editor.chain().focus().addColumnBefore().run()}
                className="rounded-md border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
                Col+
              </button>
              <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()}
                className="rounded-md border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
                Row+
              </button>
              <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()}
                className="rounded-md border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
                Col-
              </button>
              <button type="button" onClick={() => editor.chain().focus().deleteRow().run()}
                className="rounded-md border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
                Row-
              </button>
              <button type="button" onClick={() => editor.chain().focus().deleteTable().run()}
                className="rounded-md border border-red-100 px-2 py-1 text-xs text-red-500 hover:bg-red-50">
                Del table
              </button>
            </>
          )}
          <button type="button" onClick={() => insertMath(false)}
            className="rounded-md border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
            $x$
          </button>
          <button type="button" onClick={() => insertMath(true)}
            className="rounded-md border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
            $$x$$
          </button>
          <button type="button" onClick={deleteSelectedMath} disabled={!editor.isActive("rbMath")}
            className="rounded-md border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-35 disabled:hover:bg-white">
            Del formula
          </button>
          <span className="mx-1 h-5 w-px bg-gray-200" />
          <button
            type="button"
            onClick={() => editor.chain().focus().insertContent({
              type: "callout",
              attrs: { type: "note" },
              content: [{ type: "paragraph" }],
            }).run()}
            className="rounded-md border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            title="Insert callout"
          >
            💡 Callout
          </button>
          <span className="mx-1 h-5 w-px bg-gray-200" />
          <span className="px-1 text-[11px] font-medium text-gray-400">Image</span>
          {[
            ["35%", "S"],
            ["55%", "M"],
            ["75%", "L"],
            ["100%", "Full"],
          ].map(([width, label]) => (
            <button
              key={width}
              type="button"
              onClick={() => setImageWidth(width)}
              disabled={!editor.isActive("image")}
              className={`rounded-md border px-2 py-1 text-xs ${
                editor.isActive("image") && editor.getAttributes("image").width === width
                  ? "bg-gray-950 text-white"
                  : "text-gray-600 hover:bg-gray-50 disabled:opacity-35 disabled:hover:bg-white"
              }`}
            >
              {label}
            </button>
          ))}
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

function MathNodeView(props: any) {
  const { latex = "", display = false } = props.node.attrs
  let html = ""
  try {
    html = katex.renderToString(latex || "?", {
      displayMode: Boolean(display),
      throwOnError: false,
      strict: false,
    })
  } catch {
    html = escapeHtmlText(latex || "?")
  }

  return (
    <NodeViewWrapper
      as="span"
      className={`rb-math-node ${display ? "rb-math-node-block" : "rb-math-node-inline"}`}
      title={latex}
    >
      <span dangerouslySetInnerHTML={{ __html: html }} />
    </NodeViewWrapper>
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
