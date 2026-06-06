"use client"
import { useEffect, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { BookOpen, ChevronLeft } from "lucide-react"
import { api } from "@/lib/api"

interface HelpIndex {
  content: string
  docs: { name: string; title: string }[]
}

export default function HelpPage() {
  const [index, setIndex] = useState<HelpIndex | null>(null)
  const [activeDoc, setActiveDoc] = useState<{ name: string; content: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<HelpIndex>("/api/help")
      .then(setIndex)
      .catch(() => setIndex({ content: "Failed to load help.", docs: [] }))
      .finally(() => setLoading(false))
  }, [])

  async function openDoc(name: string) {
    const doc = await api.get<{ name: string; content: string }>(`/api/help/${name}`)
    setActiveDoc(doc)
  }

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading…</div>

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Sidebar ── */}
      <div className="w-52 border-r bg-gray-50 flex-shrink-0 overflow-y-auto">
        <div className="p-4 border-b">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Documentation</p>
        </div>
        <nav className="p-2 space-y-0.5">
          <button
            onClick={() => setActiveDoc(null)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
              !activeDoc ? "bg-black text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <BookOpen size={13} />
            How to Use
          </button>
          {(index?.docs ?? []).map(doc => (
            <button
              key={doc.name}
              onClick={() => openDoc(doc.name)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                activeDoc?.name === doc.name
                  ? "bg-black text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {doc.title}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-8 max-w-4xl">
          {activeDoc ? (
            <>
              <button
                onClick={() => setActiveDoc(null)}
                className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-black mb-6"
              >
                <ChevronLeft size={13} /> Back
              </button>
              <article className="prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeDoc.content}</ReactMarkdown>
              </article>
            </>
          ) : (
            <article className="prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{index?.content ?? ""}</ReactMarkdown>
            </article>
          )}
        </div>
      </div>
    </div>
  )
}
