const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem("rb_token")
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  }
  if (token) headers["Authorization"] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(formatApiError(err.detail ?? err.message ?? "Request failed"))
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),

  uploadImage: async (path: string, file: File) => {
    const token = getToken()
    const form = new FormData()
    form.append("file", file)
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    if (!res.ok) throw new Error("Upload failed")
    return res.json()
  },

  uploadForm: async <T>(path: string, form: FormData): Promise<T> => {
    const token = getToken()
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(formatApiError(err.detail ?? "Upload failed"))
    }
    return res.json()
  },

  download: async (path: string): Promise<Blob> => {
    const token = getToken()
    const res = await fetch(`${BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(formatApiError(err.detail ?? "Download failed"))
    }
    return res.blob()
  },
}

function formatApiError(detail: unknown): string {
  if (typeof detail === "string") return detail
  if (!detail || typeof detail !== "object") return "Request failed"

  const d = detail as Record<string, unknown>
  const lines = [
    typeof d.message === "string" ? d.message : "Request failed",
    typeof d.operation === "string" ? `Operation: ${d.operation}` : "",
    typeof d.request_id === "string" ? `Request ID: ${d.request_id}` : "",
    typeof d.error_type === "string" ? `Type: ${d.error_type}` : "",
    typeof d.error === "string" ? `Error: ${d.error}` : "",
    d.google_status ? `Google status: ${d.google_status}` : "",
    typeof d.google_reason === "string" ? `Google reason: ${d.google_reason}` : "",
    typeof d.google_response === "string" ? `Google response: ${d.google_response}` : "",
    Array.isArray(d.issues)
      ? `Issues:\n${d.issues.map((item: any) => `- ${item.path ?? "file"}: ${item.error ?? "invalid"}`).join("\n")}`
      : "",
  ].filter(Boolean)

  return lines.join("\n")
}

export const auth = {
  login: (email: string, password: string) =>
    api.post<{ access_token: string }>("/api/auth/login", { email, password }),
  register: (email: string, password: string, name: string) =>
    api.post<{ access_token: string }>("/api/auth/register", { email, password, name }),
  me: () => api.get<{ id: string; email: string; name: string }>("/api/auth/me"),
  saveToken: (token: string) => localStorage.setItem("rb_token", token),
  clearToken: () => localStorage.removeItem("rb_token"),
}
