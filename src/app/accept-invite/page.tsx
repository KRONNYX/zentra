"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getSignedInPath } from "@/services/authService";

export default function AcceptInvitePage() {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "valid" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(
      ({ data, error }) => {
        if (active) setState(!error && data.user ? "valid" : "invalid");
      },
      () => { if (active) setState("invalid"); },
    );
    return () => { active = false; };
  }, []);

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || state !== "valid") return;
    setError("");
    setSaving(true);
    try {
      const { data, error } = await supabase.auth.updateUser({ password });
      if (error || !data.user) {
        setError(error?.message ?? "Could not save your password.");
        return;
      }
      router.replace(await getSignedInPath(data.user));
    } catch {
      setError("Could not connect. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 p-4 text-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-xl font-bold">Set your Zentra password</h1>
        {state === "checking" && <p className="mt-3" role="status">Checking your invite…</p>}
        {state === "invalid" && (
          <p className="mt-3">This invite could not be verified. Reopen the link from your invite email, or ask the bar owner for help.</p>
        )}
        {state === "valid" && (
          <form className="mt-4 space-y-3" onSubmit={accept}>
            <label htmlFor="new-password" className="block text-sm font-medium">Password (at least 12 characters)</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-300 p-3"
            />
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <button disabled={saving} className="min-h-12 w-full rounded-lg bg-slate-950 px-4 text-white disabled:opacity-50">
              {saving ? "Saving…" : "Save password and continue"}
            </button>
          </form>
        )}
        <Link href="/login" className="mt-4 inline-block text-sm underline">Back to sign-in</Link>
      </div>
    </main>
  );
}
