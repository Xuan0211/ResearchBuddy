"use client"
import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { BookOpen, ChevronDown, ChevronRight, Link2 } from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocNode {
  type: "doc" | "dir"
  name: string
  title: string
  path: string
  children?: DocNode[]
}

interface HelpIndex {
  content: string
  tree: DocNode[]
}

// ── Markdown components with proper table + code rendering ────────────────────

const MD: Record<string, React.ComponentType<any>> = {
  table: ({ children }) => (
    <div className="overflow-x-auto my-5">
      <table className="min-w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-gray-100 even:bg-gray-50/40">{children}</tr>,
  th: ({ children }) => (
    <th className="border border-gray-200 px-4 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-gray-200 px-4 py-2 text-gray-700">{children}</td>
  ),
  code: ({ inline, className, children }) => {
    if (inline) {
      return (
        <code className="bg-gray-100 text-gray-800 rounded px-1.5 py-0.5 font-mono text-[13px]">
          {children}
        </code>
      )
    }
    return (
      <pre className="bg-gray-50 border border-gray-200 rounded-xl p-4 overflow-x-auto my-4">
        <code className="font-mono text-[13px] text-gray-800 leading-relaxed">{children}</code>
      </pre>
    )
  },
  h1: ({ children }) => <h1 className="text-2xl font-bold mt-8 mb-4 text-gray-900">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-semibold mt-7 mb-3 text-gray-900 border-b pb-1">{children}</h2>,
  h3: ({ children }) => <h3 className="text-base font-semibold mt-5 mb-2 text-gray-900">{children}</h3>,
  p: ({ children }) => <p className="my-3 leading-relaxed text-gray-700">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 my-3 space-y-1 text-gray-700">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 my-3 space-y-1 text-gray-700">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ href, children }) => (
    <a href={href} target={href?.startsWith("http") ? "_blank" : undefined}
      rel="noreferrer" className="text-blue-600 hover:text-blue-800 underline underline-offset-2">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-gray-200 pl-4 my-4 text-gray-600 italic">{children}</blockquote>
  ),
  hr: () => <hr className="my-6 border-gray-100" />,
}

// ── Sidebar tree ──────────────────────────────────────────────────────────────

function TreeNode({ node, activePath }: { node: DocNode; activePath: string }) {
  const [open, setOpen] = useState(true)

  if (node.type === "doc") {
    const isActive = activePath === node.path
    return (
      <Link
        href={`/help/${node.path}`}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
          isActive ? "bg-black text-white font-medium" : "text-gray-600 hover:bg-gray-100"
        }`}
      >
        {node.title}
      </Link>
    )
  }

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide hover:text-gray-600"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {node.title}
      </button>
      {open && (
        <div className="ml-2 pl-2 border-l border-gray-100 space-y-0.5">
          {node.children?.map(child => (
            <TreeNode key={child.path || child.name} node={child} activePath={activePath} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export default function HelpPage() {
  const params = useParams<{ slug?: string[] }>()
  const router = useRouter()
  const slug = params.slug ?? []
  const currentPath = slug.join("/") // "" for index

  const [index, setIndex] = useState<HelpIndex | null>(null)
  const [docContent, setDocContent] = useState<string | null>(null)
  const [docTitle, setDocTitle] = useState("")
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  // Load index tree once
  useEffect(() => {
    fetch(`${BASE}/api/help`)
      .then(r => r.json())
      .then(setIndex)
      .catch(() => setIndex({ content: "", tree: [] }))
  }, [])

  // Load doc content when path changes
  useEffect(() => {
    if (!currentPath) {
      setDocContent(null)
      setDocTitle("")
      setLoading(false)
      return
    }
    setLoading(true)
    fetch(`${BASE}/api/help/${currentPath}`)
      .then(r => r.json())
      .then(d => { setDocContent(d.content); setDocTitle(d.title) })
      .catch(() => { setDocContent("# Not found\n\nThis document doesn't exist."); setDocTitle("") })
      .finally(() => setLoading(false))
  }, [currentPath])

  function copyLink() {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const content = currentPath ? docContent : (index?.content ?? null)
  const title = currentPath ? docTitle : "How to Use ResearchBuddy"

  return (
    <>
      {/* ── Sidebar ── */}
      <aside className="w-56 border-r bg-gray-50 flex-shrink-0 overflow-y-auto">
        <div className="p-3 border-b">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Docs</p>
        </div>
        <nav className="p-2 space-y-0.5">
          <Link
            href="/help"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
              !currentPath ? "bg-black text-white font-medium" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <BookOpen size={13} className="flex-shrink-0" />
            How to Use
          </Link>
          {(index?.tree ?? []).map(node => (
            <TreeNode key={node.path || node.name} node={node} activePath={currentPath} />
          ))}
        </nav>
      </aside>

      {/* ── Content ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-8">
          {loading ? (
            <div className="text-sm text-gray-400">Loading…</div>
          ) : content !== null ? (
            <>
              {/* Breadcrumb + share */}
              {currentPath && (
                <div className="flex items-center justify-between mb-6">
                  <nav className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Link href="/help" className="hover:text-gray-700">Docs</Link>
                    {slug.map((part, i) => (
                      <span key={i} className="flex items-center gap-1.5">
                        <span>/</span>
                        {i < slug.length - 1 ? (
                          <Link href={`/help/${slug.slice(0, i + 1).join("/")}`} className="hover:text-gray-700 capitalize">
                            {part.replace(/-/g, " ")}
                          </Link>
                        ) : (
                          <span className="text-gray-600 font-medium capitalize">{part.replace(/-/g, " ")}</span>
                        )}
                      </span>
                    ))}
                  </nav>
                  <button
                    onClick={copyLink}
                    className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 border rounded-lg px-2.5 py-1.5"
                  >
                    <Link2 size={11} />
                    {copied ? "Copied!" : "Copy link"}
                  </button>
                </div>
              )}
              <article className="text-sm text-gray-700 leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>
                  {content}
                </ReactMarkdown>
              </article>
            </>
          ) : (
            <div className="text-sm text-gray-400">Select a doc from the sidebar.</div>
          )}
        </div>
      </main>
    </>
  )
}
