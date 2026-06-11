"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowUp, MessageSquarePlus, Send } from "lucide-react"
import { api } from "@/lib/api"
import type { FeedbackPost } from "@/lib/types"

function formatWhen(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export default function FeedbackPage() {
  const [items, setItems] = useState<FeedbackPost[]>([])
  const [form, setForm] = useState({ title: "", body: "" })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    api.get<FeedbackPost[]>("/api/feedback")
      .then(setItems)
      .catch(err => setMessage(err instanceof Error ? err.message : "Could not load feedback"))
      .finally(() => setLoading(false))
  }, [])

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => b.votes - a.votes || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [items])

  async function submitFeedback(e: React.FormEvent) {
    e.preventDefault()
    if (!form.body.trim()) return
    setSubmitting(true)
    setMessage("")
    try {
      const created = await api.post<FeedbackPost>("/api/feedback", form)
      setItems(prev => [created, ...prev])
      setForm({ title: "", body: "" })
      setMessage(created.notification_sent ? "Feedback posted and emailed." : "Feedback posted. Email notification was not sent.")
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Could not post feedback")
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleVote(item: FeedbackPost) {
    try {
      const updated = await api.post<FeedbackPost>(`/api/feedback/${item.id}/vote`)
      setItems(prev => prev.map(row => row.id === item.id ? updated : row))
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Could not update vote")
    }
  }

  return (
    <div className="h-full overflow-auto bg-gray-50">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-6 py-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Feedback</h1>
          <p className="text-sm text-gray-500">Requests with more votes rise to the top.</p>
        </div>

        <form onSubmit={submitFeedback} className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <MessageSquarePlus size={16} />
            New request
          </div>
          <input
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            maxLength={120}
            placeholder="Short title"
            className="mb-2 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
          />
          <textarea
            value={form.body}
            onChange={e => setForm({ ...form, body: e.target.value })}
            maxLength={4000}
            required
            placeholder="What would make ResearchBuddy better for your work?"
            className="min-h-28 w-full resize-y rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-gray-400">{form.body.length}/4000</span>
            <button
              type="submit"
              disabled={submitting || !form.body.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-black px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
            >
              <Send size={13} />
              {submitting ? "Posting..." : "Post"}
            </button>
          </div>
        </form>

        {message && <p className="rounded-md border bg-white px-4 py-2 text-xs text-gray-500">{message}</p>}

        <div className="space-y-3">
          {loading && <p className="rounded-lg border bg-white px-4 py-6 text-sm text-gray-400">Loading feedback...</p>}
          {!loading && sortedItems.length === 0 && <p className="rounded-lg border bg-white px-4 py-6 text-sm text-gray-400">No feedback yet.</p>}
          {sortedItems.map(item => (
            <article key={item.id} className="flex gap-4 rounded-lg border bg-white p-4 shadow-sm">
              <button
                type="button"
                onClick={() => toggleVote(item)}
                className={`flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-md border text-xs font-medium ${item.voted_by_me ? "border-black bg-black text-white" : "text-gray-600 hover:bg-gray-50"}`}
                title={item.voted_by_me ? "Remove vote" : "Vote"}
              >
                <ArrowUp size={15} />
                {item.votes}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h2 className="min-w-0 text-sm font-semibold">{item.title || "Untitled request"}</h2>
                  <span className="text-xs text-gray-400">{formatWhen(item.created_at)}</span>
                </div>
                <p className="mt-1 text-xs text-gray-400">{item.author_name}</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">{item.body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
