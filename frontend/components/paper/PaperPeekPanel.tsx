"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { X, Maximize2, ExternalLink, Copy, Check, Tag } from "lucide-react"
import { api } from "@/lib/api"
import type { Paper } from "@/lib/types"

interface Props {
  paperId: string
  projectId: string
  onClose: () => void
}

export default function PaperPeekPanel({ paperId, projectId, onClose }: Props) {
  const router = useRouter()
  const [paper, setPaper] = useState<Paper | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

  useEffect(() => {
    api.get<Paper>(`/api/projects/${projectId}/papers/${paperId}`)
      .then(setPaper).finally(() => setLoading(false))
  }, [projectId, paperId])

  function copyKey() {
    if (!paper) return
    const key = paper.id.replace(/[^\x00-\x7Fa-zA-Z0-9_-]/g, "")
    navigator.clipboard.writeText(key)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40 transition-opacity" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[420px] xl:w-[480px] bg-white shadow-2xl z-50 flex flex-col
                      animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b flex-shrink-0">
          <span className="text-xs text-gray-400 font-mono truncate flex-1">
            {paper?.id ?? paperId}
          </span>
          <button onClick={copyKey} title="Copy citation key"
            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          </button>
          <button onClick={() => { onClose(); router.push(`/projects/${projectId}/papers/${paperId}`) }}
            title="Open full page"
            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
            <Maximize2 size={14} />
          </button>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="text-sm text-gray-400">Loading…</div>
          ) : !paper ? (
            <div className="text-sm text-red-500">Not found</div>
          ) : (
            <>
              {/* Preview image */}
              {paper.preview_image && (
                <img src={`${BASE}${paper.preview_image}`} alt=""
                  className="w-full max-h-52 object-contain rounded-lg border bg-gray-50" />
              )}

              {/* Title + meta */}
              <div className="space-y-1">
                <h2 className="font-semibold text-sm leading-snug">{paper.title}</h2>
                <p className="text-xs text-gray-600">{paper.authors?.slice(0, 3).join(", ")}{(paper.authors?.length ?? 0) > 3 ? " et al." : ""}</p>
                <p className="text-xs text-gray-400">{[paper.venue, paper.year].filter(Boolean).join(" · ")}</p>
              </div>

              {/* Abstract */}
              {paper.abstract && (
                <p className="text-xs text-gray-600 leading-relaxed line-clamp-5">{paper.abstract}</p>
              )}

              {/* Tags */}
              {paper.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {paper.tags.map(t => (
                    <span key={t} className="flex items-center gap-0.5 text-[10px] bg-gray-100 px-1.5 py-0.5 rounded-full text-gray-500">
                      <Tag size={8} />{t}
                    </span>
                  ))}
                </div>
              )}

              {/* Links */}
              <div className="flex flex-wrap gap-2">
                {paper.arxiv_id && (
                  <a href={paper.links?.arxiv || `https://arxiv.org/abs/${paper.arxiv_id}`} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-xs bg-red-50 text-red-700 px-2 py-1 rounded-lg hover:bg-red-100">
                    arXiv <ExternalLink size={10} />
                  </a>
                )}
                {paper.links?.url && (
                  <a href={paper.links.url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg hover:bg-emerald-100">
                    URL <ExternalLink size={10} />
                  </a>
                )}
                {paper.doi && (
                  <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-100">
                    DOI <ExternalLink size={10} />
                  </a>
                )}
                {paper.links?.zotero_web && (
                  <a href={paper.links.zotero_web} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-lg hover:bg-amber-100">
                    Zotero <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-3 flex-shrink-0">
          <button
            onClick={() => { onClose(); router.push(`/projects/${projectId}/papers/${paperId}`) }}
            className="w-full flex items-center justify-center gap-2 text-sm bg-black text-white rounded-lg py-2 hover:bg-gray-800"
          >
            <Maximize2 size={14} /> Open full page
          </button>
        </div>
      </div>
    </>
  )
}
