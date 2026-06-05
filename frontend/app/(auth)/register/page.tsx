"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { auth } from "@/lib/api"

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ name: "", email: "", password: "" })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const { access_token } = await auth.register(form.email, form.password, form.name)
      auth.saveToken(access_token)
      router.push("/projects")
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-6 bg-white p-8 rounded-xl shadow-sm border">
        <div>
          <h1 className="text-2xl font-semibold">ResearchBuddy</h1>
          <p className="text-sm text-gray-500 mt-1">Create your account</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {(["name", "email", "password"] as const).map((field) => (
            <div key={field}>
              <label className="block text-sm font-medium mb-1 capitalize">{field}</label>
              <input
                type={field === "password" ? "password" : field === "email" ? "email" : "text"}
                value={form[field]}
                onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                required
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          ))}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>
        <p className="text-sm text-center text-gray-500">
          Have an account?{" "}
          <Link href="/login" className="text-black font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
