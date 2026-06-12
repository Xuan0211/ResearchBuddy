/**
 * WikiLink TipTap extension.
 * Triggers on [[ for papers and {{ / @ for documents.
 * Renders links as styled decorations over Markdown-friendly tokens.
 */
import { Extension, Mark, mergeAttributes } from "@tiptap/core"
import { Plugin, PluginKey, TextSelection } from "prosemirror-state"
import type { EditorState } from "prosemirror-state"
import { Decoration, DecorationSet } from "prosemirror-view"

// ── WikiLink mark (visual styling for [[...]]) ──────────────────────────────

export const WikiLinkMark = Mark.create({
  name: "wikiLink",
  inclusive: false,

  addAttributes() {
    return { id: { default: null } }
  },

  parseHTML() {
    return [{ tag: 'span[data-wiki-link]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, {
      "data-wiki-link": "",
      class: "wiki-link",
      style: "color:#2563eb;cursor:pointer;border-bottom:1px solid #93c5fd",
    }), 0]
  },
})

// ── Suggestion state ────────────────────────────────────────────────────────

export interface WikiSuggestionState {
  active: boolean
  mode: "paper" | "doc"
  query: string
  range: { from: number; to: number }
  rect: DOMRect | null
}

export const wikiSuggestionKey = new PluginKey<WikiSuggestionState>("wikiSuggestion")

const TRIGGER_RE = /(\[\[|【【|\{\{|@)([^\]\}\n【@]*)$/
const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g
const DOC_REF_RE = /\{\{([^}|]+)(?:\|([^}]+))?\}\}/g

type DocResolver = (id: string, title?: string) => { label: string; missing: boolean }
type AiPendingGetter = () => Set<string>

function findWikiLinkRange(state: EditorState, pos: number, key: "Backspace" | "Delete") {
  const $pos = state.doc.resolve(pos)
  const parent = $pos.parent
  if (!parent.isTextblock) return null

  const parentStart = $pos.start()
  const offset = pos - parentStart
  const text = parent.textBetween(0, parent.content.size, "\n", "\0")
  let m: RegExpExecArray | null
  for (const re of [WIKI_LINK_RE, DOC_REF_RE]) {
    re.lastIndex = 0
    while ((m = re.exec(text))) {
      const start = m.index
      const end = m.index + m[0].length
      const shouldDelete = key === "Backspace"
        ? offset > start && offset <= end
        : offset >= start && offset < end
      if (shouldDelete) {
        return { from: parentStart + start, to: parentStart + end }
      }
    }
  }
  return null
}

export function createWikiLinkPlugin(
  onStateChange: (state: WikiSuggestionState) => void,
  resolveDocRef?: DocResolver,
  getAiPendingKeys?: AiPendingGetter,
) {
  return new Plugin({
    key: wikiSuggestionKey,

    state: {
      init(): WikiSuggestionState {
        return { active: false, mode: "paper", query: "", range: { from: 0, to: 0 }, rect: null }
      },
      apply(tr, prev): WikiSuggestionState {
        const sel = tr.selection
        if (!(sel instanceof TextSelection)) return { ...prev, active: false }
        const { from } = sel
        const text = tr.doc.textBetween(Math.max(0, from - 60), from, "\n", "\0")
        const m = TRIGGER_RE.exec(text)
        if (!m) return { ...prev, active: false }
        const trigger = m[1]
        return {
          active: true,
          mode: trigger === "[[" || trigger === "【【" ? "paper" : "doc",
          query: m[2],
          range: { from: from - m[0].length, to: from },
          rect: null,
        }
      },
    },

    view(editorView) {
      let prevActive = false
      let prevQuery = ""
      let prevFrom = 0
      return {
        update(view) {
          const next = wikiSuggestionKey.getState(view.state)!
          // Only notify when something meaningful changes — prevents infinite setState loop
          if (
            next.active === prevActive &&
            next.query === prevQuery &&
            next.range.from === prevFrom
          ) return
          prevActive = next.active
          prevQuery = next.query
          prevFrom = next.range.from

          let rect: DOMRect | null = null
          if (next.active) {
            try {
              const coords = view.coordsAtPos(view.state.selection.from)
              rect = new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top)
            } catch {}
          }
          onStateChange({ ...next, rect })
        },
        destroy() {
          onStateChange({ active: false, mode: "paper", query: "", range: { from: 0, to: 0 }, rect: null })
        },
      }
    },

    props: {
      // Highlight [[...]] patterns as decorations
      decorations(state) {
        const decos: Decoration[] = []
        state.doc.descendants((node, pos) => {
          if (!node.isText) return
          const text = node.text!
          let m: RegExpExecArray | null
          WIKI_LINK_RE.lastIndex = 0
          while ((m = WIKI_LINK_RE.exec(text))) {
            const paperId = m[1]
            const isPending = getAiPendingKeys?.().has(paperId) ?? false
            decos.push(
              Decoration.inline(pos + m.index, pos + m.index + m[0].length, {
                class: isPending ? "wiki-link-decoration is-ai-pending" : "wiki-link-decoration",
                "data-paper-id": paperId,
                "data-wiki-label": paperId,
              })
            )
          }
          DOC_REF_RE.lastIndex = 0
          while ((m = DOC_REF_RE.exec(text))) {
            const id = m[1]
            const title = m[2] || id
            const resolved = resolveDocRef?.(id, title) ?? { label: title, missing: false }
            decos.push(
              Decoration.inline(pos + m.index, pos + m.index + m[0].length, {
                class: `doc-link-decoration${resolved.missing ? " is-missing" : ""}`,
                "data-doc-id": id,
                "data-doc-title": title,
                "data-wiki-label": resolved.missing ? `${resolved.label} (missing)` : resolved.label,
              })
            )
          }
        })
        return DecorationSet.create(state.doc, decos)
      },

      handleKeyDown(view, event) {
        if (event.key !== "Backspace" && event.key !== "Delete") return false
        const selection = view.state.selection
        if (!selection.empty) return false
        const range = findWikiLinkRange(view.state, selection.from, event.key)
        if (!range) return false
        event.preventDefault()
        view.dispatch(view.state.tr.delete(range.from, range.to))
        return true
      },
    },
  })
}

// ── Extension wrapper ───────────────────────────────────────────────────────

export const WikiLinkExtension = (
  onStateChange: (state: WikiSuggestionState) => void,
  resolveDocRef?: DocResolver,
  getAiPendingKeys?: AiPendingGetter,
) =>
  Extension.create({
    name: "wikiLinkExtension",

    addProseMirrorPlugins() {
      return [createWikiLinkPlugin(onStateChange, resolveDocRef, getAiPendingKeys)]
    },

    addKeyboardShortcuts() {
      return {
        // Convert 【【 to [[ immediately
        "【": ({ editor }) => {
          const { from } = editor.state.selection
          const before = editor.state.doc.textBetween(Math.max(0, from - 1), from)
          if (before === "【") {
            editor.chain().deleteRange({ from: from - 1, to: from }).insertContent("[[").run()
            return true
          }
          return false
        },
      }
    },
  })
