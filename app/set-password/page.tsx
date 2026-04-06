"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);

    if (params.get("error")) {
      setError("expired");
      return;
    }

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (accessToken && refreshToken) {
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(() => {
          window.history.replaceState(null, "", "/set-password");
          setSessionReady(true);
        })
        .catch(() => setError("Invalid or expired invite link."));
    } else {
      setSessionReady(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      router.push("/connect-data-source");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 px-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Set your password</h1>
          <p className="text-sm text-muted-foreground">Choose a password to complete your account setup.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
          <Input
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
          />
          {error === "expired" ? (
            <p className="text-sm text-destructive">
              This invite link has expired or already been used.{" "}
              <a
                href={`mailto:boyangpanworks@gmail.com?subject=${encodeURIComponent("Training Chat — new invite request")}&body=${encodeURIComponent("Hi Bo,\n\nMy invite link has expired. Could you send a new one?\n\nThanks")}`}
                className="underline underline-offset-2"
              >
                Ask for a new one.
              </a>
            </p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
          <Button type="submit" className="w-full" disabled={loading || !sessionReady}>
            {loading ? "Saving…" : "Set password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
