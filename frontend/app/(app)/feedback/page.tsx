"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowUp, Image as ImageIcon, MessageSquarePlus, Send, X } from "lucide-react"
import { api } from "@/lib/api"
import type { FeedbackPost } from "@/lib/types"
import RoadmapBoard from "@/components/RoadmapBoard"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

function formatWhen(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

/** Render feedback body: display markdown images inline, rest as preformatted text. */
function FeedbackBody({ text }: { text: string }) {
  // Split on ![alt](url) patterns, render images inline
  const parts = text.split(/(!\[[^\]]*\]\([^)]+\))/g)
  return (
    <p className="mt-3 text-sm leading-6 text-gray-700">
      {parts.map((part, i) => {
        const m = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
        if (m) {
          return (
            <img
              key={i}
              src={m[2].startsWith("/") ? `${BASE}${m[2]}` : m[2]}
              alt={m[1] || "image"}
              className="my-2 max-w-full rounded-lg border"
              style={{ maxHeight: 400 }}
            />
          )
        }
        return <span key={i} className="whitespace-pre-wrap">{part}</span>
      })}
    </p>
  )
}

export default function FeedbackPage() {
  const [items, setItems] = useState<FeedbackPost[]>([])
  const [form, setForm] = useState({ title: "", body: "" })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")
  const [uploadingImage, setUploadingImage] = useState(false)
  const [pendingImages, setPendingImages] = useState<string[]>([]) // preview URLs
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.get<FeedbackPost[]>("/api/feedback")
      .then(setItems)
      .catch(err => setMessage(err instanceof Error ? err.message : "Could not load feedback"))
      .finally(() => setLoading(false))
  }, [])

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => b.votes - a.votes || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [items])

  async function uploadImage(file: File): Promise<string | null> {
    const form = new FormData()
    form.append("file", file)
    try {
      const res = await api.uploadForm<{ url: string }>("/api/feedback/images", form)
      return res.url
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Image upload failed")
      return null
    }
  }

  function insertAtCursor(text: string) {
    const ta = textareaRef.current
    if (!ta) {
      setForm(f => ({ ...f, body: f.body + text }))
      return
    }
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const before = ta.value.slice(0, start)
    const after = ta.value.slice(end)
    const newBody = before + text + after
    setForm(f => ({ ...f, body: newBody }))
    // Restore cursor after the inserted text
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + text.length
      ta.focus()
    })
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items)
    const imageItem = items.find(item => item.type.startsWith("image/"))
    if (!imageItem) return
    e.preventDefault()
    const file = imageItem.getAsFile()
    if (!file) return
    setUploadingImage(true)
    const url = await uploadImage(file)
    setUploadingImage(false)
    if (url) {
      insertAtCursor(`![image](${url})`)
      setPendingImages(prev => [...prev, url])
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    const url = await uploadImage(file)
    setUploadingImage(false)
    if (url) {
      insertAtCursor(`![image](${url})`)
      setPendingImages(prev => [...prev, url])
    }
    e.target.value = ""
  }

  async function submitFeedback(e: React.FormEvent) {
    e.preventDefault()
    if (!form.body.trim()) return
    setSubmitting(true)
    setMessage("")
    try {
      const created = await api.post<FeedbackPost>("/api/feedback", form)
      setItems(prev => [created, ...prev])
      setForm({ title: "", body: "" })
      setPendingImages([])
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

        <RoadmapBoard />

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
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={form.body}
              onChange={e => setForm({ ...form, body: e.target.value })}
              onPaste={handlePaste}
              maxLength={4000}
              required
              placeholder="What would make ResearchBuddy better for your work? You can paste screenshots directly."
              className="min-h-28 w-full resize-y rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
            />
            {uploadingImage && (
              <div className="absolute inset-0 flex items-center justify-center rounded-md bg-white/70 text-xs text-gray-500">
                Uploading image…
              </div>
            )}
          </div>

          {/* Image previews */}
          {pendingImages.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {pendingImages.map((url, i) => (
                <div key={i} className="relative">
                  <img
                    src={url.startsWith("/") ? `${BASE}${url}` : url}
                    alt="attached"
                    className="h-16 w-auto rounded border object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setPendingImages(prev => prev.filter((_, j) => j !== i))
                      setForm(f => ({ ...f, body: f.body.replace(`![image](${url})`, "") }))
                    }}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-gray-700 p-0.5 text-white hover:bg-red-600"
                  >
                    <X size={9} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">{form.body.length}/4000</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                title="Attach image"
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-40"
              >
                <ImageIcon size={13} />
                Image
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
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
                <FeedbackBody text={item.body} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
