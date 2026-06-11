"use client"
import { useEffect, useState } from "react"
import { MessageSquare, Send, Trash2 } from "lucide-react"
import { api } from "@/lib/api"

interface Comment {
  id: string
  text: string
  author_name: string
  created_at: string
}

export default function DocumentCommentsPanel({
  projectId,
  resource,
  itemId,
}: {
  projectId: string
  resource: "docs" | "meetings" | "papers"
  itemId: string
}) {
  const [comments, setComments] = useState<Comment[]>([])
  const [draft, setDraft] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const basePath = `/api/projects/${projectId}/${resource}/${itemId}/comments`

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<{ comments: Comment[] }>(basePath)
      setComments(res.comments ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [projectId, resource, itemId])

  async function addComment(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    setSaving(true)
    try {
      const res = await api.post<{ comments: Comment[] }>(basePath, { text: draft.trim() })
      setComments(res.comments ?? [])
      setDraft("")
    } finally {
      setSaving(false)
    }
  }

  async function removeComment(comment: Comment) {
    await api.delete(`${basePath}/${comment.id}`)
    setComments(prev => prev.filter(item => item.id !== comment.id))
  }

  return (
    <aside className="w-72 shrink-0 border-l bg-gray-50/70">
      <div className="flex h-full flex-col">
        <div className="border-b bg-white px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <MessageSquare size={14} /> Comments
          </p>
          <p className="mt-0.5 text-[11px] text-gray-400">Synced into Drive as ResearchBuddy metadata.</p>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {loading ? (
            <p className="text-xs text-gray-400">Loading comments...</p>
          ) : comments.length === 0 ? (
            <p className="rounded-lg border border-dashed bg-white px-3 py-4 text-xs text-gray-400">
              No comments yet.
            </p>
          ) : comments.map(comment => (
            <div key={comment.id} className="group rounded-lg border bg-white p-3 shadow-sm">
              <div className="mb-1 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-gray-700">{comment.author_name}</p>
                  <p className="text-[10px] text-gray-400">
                    {comment.created_at ? new Date(comment.created_at).toLocaleString() : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeComment(comment)}
                  className="opacity-0 text-gray-300 hover:text-red-500 group-hover:opacity-100"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <p className="whitespace-pre-wrap text-xs leading-5 text-gray-600">{comment.text}</p>
            </div>
          ))}
        </div>

        <form onSubmit={addComment} className="border-t bg-white p-3">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Add a comment..."
            rows={4}
            className="w-full resize-none rounded-lg border px-3 py-2 text-xs leading-5 focus:outline-none focus:ring-1 focus:ring-black"
          />
          <button
            type="submit"
            disabled={saving || !draft.trim()}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-black px-3 py-2 text-xs text-white disabled:opacity-45"
          >
            <Send size={12} /> {saving ? "Adding..." : "Add comment"}
          </button>
        </form>
      </div>
    </aside>
  )
}
