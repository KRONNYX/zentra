"use client";

import { useEffect, useState } from "react";
import { getCurrentUser, getSignedInPath, signInWithPassword } from "@/services/authService";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function resumeSession() {
      try {
        const { user } = await getCurrentUser();
        if (!user || !active) return;
        const path = await getSignedInPath(user);
        if (active) router.replace(path);
      } finally {
        if (active) setCheckingSession(false);
      }
    }
    void resumeSession().catch(() => {});
    return () => { active = false; };
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { user, error } = await signInWithPassword(email.trim(), password);
      if (!user || error) {
        setError("Could not sign in. Check your email and password and try again.");
        return;
      }
      router.replace(await getSignedInPath(user));
    } catch {
      setError("Could not connect. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4 py-8">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md rounded-xl bg-background p-5 shadow sm:p-8"
      >
        <h1 className="mb-6 text-2xl font-bold">Zentra Login</h1>

        <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          required
          className="mb-4 w-full rounded border p-3"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label htmlFor="password" className="mb-1 block text-sm font-medium">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          className="mb-4 w-full rounded border p-3"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>
        )}

        <button
          type="submit"
          className="w-full rounded bg-black p-3 text-white"
          disabled={loading || checkingSession}
        >
          {checkingSession ? "Checking sign-in…" : loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
