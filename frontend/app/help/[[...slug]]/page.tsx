"use client"
import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import { BookOpen, ChevronDown, ChevronRight, File, Folder, Link2 } from "lucide-react"

// Reuse the same NotionEditor in readOnly mode — gets callouts, tables, math, etc. for free
const NotionEditor = dynamic(() => import("@/components/editor/NotionEditor"), { ssr: false })

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocNode {
  type: "doc" | "dir"
  name: string
  title: string
  path: string
  display_name?: string
  children?: DocNode[]
}

interface HelpIndex {
  tree: DocNode[]
  first_path: string | null
}

// ── Sidebar tree ──────────────────────────────────────────────────────────────

function SidebarDoc({ node, activePath }: { node: DocNode; activePath: string }) {
  const isActive = activePath === node.path
  return (
    <Link
      href={`/help/${node.path}`}
      className={`flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg text-sm transition-colors group ${
        isActive
          ? "bg-black text-white font-medium"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      }`}
    >
      <File size={12} className={`shrink-0 ${isActive ? "text-gray-300" : "text-gray-400"}`} />
      <span className="truncate">{node.title}</span>
    </Link>
  )
}

function SidebarDir({
  node,
  activePath,
  depth = 0,
}: {
  node: DocNode
  activePath: string
  depth?: number
}) {
  // Auto-open if any child is active
  const isChildActive = (n: DocNode): boolean => {
    if (n.type === "doc") return n.path === activePath
    return n.children?.some(isChildActive) ?? false
  }
  const [open, setOpen] = useState(() => isChildActive(node))

  // Re-open when active path changes to a child
  useEffect(() => {
    if (isChildActive(node)) setOpen(true)
  }, [activePath]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        style={{ paddingLeft: depth * 8 + 8 }}
      >
        {open
          ? <ChevronDown size={13} className="shrink-0 text-gray-400" />
          : <ChevronRight size={13} className="shrink-0 text-gray-400" />}
        <Folder size={13} className="shrink-0 text-amber-400" />
        <span className="text-xs font-semibold tracking-wide">{node.title}</span>
      </button>
      {open && (
        <div className="ml-4 pl-2 border-l border-gray-100 space-y-0.5 mt-0.5">
          {node.children?.map(child =>
            child.type === "dir"
              ? <SidebarDir key={child.path} node={child} activePath={activePath} depth={depth + 1} />
              : <SidebarDoc key={child.path} node={child} activePath={activePath} />
          )}
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
  const currentPath = slug.join("/")

  const [index, setIndex] = useState<HelpIndex | null>(null)
  const [docContent, setDocContent] = useState<string>("")
  const [docTitle, setDocTitle] = useState("")
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  // Load tree once; auto-redirect to first doc if at root
  useEffect(() => {
    fetch(`${BASE}/api/help`)
      .then(r => r.json())
      .then((data: HelpIndex) => {
        setIndex(data)
        if (!currentPath && data.first_path) {
          router.replace(`/help/${data.first_path}`)
        }
      })
      .catch(() => setIndex({ tree: [], first_path: null }))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load doc content when path changes
  useEffect(() => {
    if (!currentPath) { setLoading(false); return }
    setLoading(true)
    setDocContent("")
    fetch(`${BASE}/api/help/${currentPath}`)
      .then(r => r.json())
      .then(d => { setDocContent(d.content ?? ""); setDocTitle(d.title ?? "") })
      .catch(() => {
        setDocContent("# Not found\n\nThis document doesn't exist.")
        setDocTitle("Not found")
      })
      .finally(() => setLoading(false))
  }, [currentPath])

  function copyLink() {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Build breadcrumb from slug
  const breadcrumb = slug.map((part, i) => ({
    label: part.replace(/^\d+-/, "").replace(/-/g, " "),
    href: i < slug.length - 1 ? `/help/${slug.slice(0, i + 1).join("/")}` : null,
  }))

  return (
    <>
      {/* ── Sidebar ── */}
      <aside className="w-60 border-r bg-gray-50 flex-shrink-0 overflow-y-auto">
        <div className="px-3 py-3 border-b">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <BookOpen size={13} />
            Documentation
          </div>
        </div>
        <nav className="p-2 space-y-0.5">
          {(index?.tree ?? []).map(node =>
            node.type === "dir"
              ? <SidebarDir key={node.path} node={node} activePath={currentPath} />
              : <SidebarDoc key={node.path} node={node} activePath={currentPath} />
          )}
        </nav>
      </aside>

      {/* ── Content ── */}
      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">Loading…</div>
        ) : currentPath && docContent ? (
          <div className="max-w-3xl mx-auto">
            {/* Top bar: breadcrumb + copy link */}
            <div className="sticky top-0 z-10 bg-white border-b px-8 py-3 flex items-center justify-between">
              <nav className="flex items-center gap-1.5 text-xs text-gray-400 min-w-0">
                <Link href="/help" className="hover:text-gray-700 shrink-0">Docs</Link>
                {breadcrumb.map((crumb, i) => (
                  <span key={i} className="flex items-center gap-1.5 min-w-0">
                    <span className="shrink-0">/</span>
                    {crumb.href ? (
                      <Link href={crumb.href} className="hover:text-gray-700 capitalize truncate">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="text-gray-700 font-medium capitalize truncate">{crumb.label}</span>
                    )}
                  </span>
                ))}
              </nav>
              <button
                onClick={copyLink}
                className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 border rounded-lg px-2.5 py-1.5 shrink-0 ml-4"
              >
                <Link2 size={11} />
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>

            {/* Doc body — rendered via NotionEditor (readOnly) for full wiki feature parity */}
            <div className="pb-16">
              <NotionEditor
                key={currentPath}
                content={docContent}
                readOnly={true}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">
            Select a doc from the sidebar.
          </div>
        )}
      </main>
    </>
  )
}
