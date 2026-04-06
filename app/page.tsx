"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, Watch, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [stravaUrl, setStravaUrl] = useState("");
  const [useCase, setUseCase] = useState("");
  const [step, setStep] = useState<"initial" | "optional" | "success">("initial");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleInitialSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStep("optional");
  }

  async function handleFinalSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, strava_url: stravaUrl || null, use_case: useCase || null }),
      });
      if (res.status === 409) {
        setError("This email is already on the waitlist.");
        return;
      }
      if (!res.ok) throw new Error();
      setStep("success");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-zinc-100 dark:border-zinc-900">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-zinc-900 dark:text-zinc-100" />
          <span className="font-semibold text-sm tracking-tight">Training Chat</span>
        </div>
        <Link href="/login">
          <Button variant="ghost" size="sm" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            Sign in
          </Button>
        </Link>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <h1 className="text-5xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 max-w-xl leading-tight">
          Chat about your training data.
        </h1>
        <p className="mt-5 text-lg text-zinc-500 dark:text-zinc-400 max-w-md leading-relaxed">
          Connect your training data and ask anything in plain English. Pace trends, recovery, personal bests, and more.
        </p>

        {/* Waitlist form */}
        <div className="mt-8 w-full max-w-sm">
          {step === "success" ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              You&apos;re on the list. We&apos;ll be in touch.
            </p>
          ) : step === "initial" ? (
            <form onSubmit={handleInitialSubmit} className="flex gap-2">
              <Input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="flex-1"
              />
              <Button type="submit">
                Join waitlist <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </form>
          ) : (
            <form onSubmit={handleFinalSubmit} className="space-y-3 text-left">
              <p className="text-xs text-zinc-400 text-center mb-1">
                Increase your chances of early access
              </p>
              <Input
                type="url"
                placeholder="Strava or Garmin profile URL (optional)"
                value={stravaUrl}
                onChange={(e) => setStravaUrl(e.target.value)}
              />
              <Textarea
                placeholder="How would you use this? (optional)"
                value={useCase}
                onChange={(e) => setUseCase(e.target.value)}
                rows={3}
                className="resize-none"
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Joining…" : "Complete signup"}
              </Button>
              <button
                type="button"
                className="w-full text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                onClick={handleFinalSubmit}
              >
                Skip and join →
              </button>
            </form>
          )}
        </div>

        {/* Connectors */}
        <div className="mt-6 flex items-center gap-2 flex-wrap justify-center">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-300">
            <Activity className="w-3 h-3" />
            Strava
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-0.5" />
            <span className="text-emerald-600 dark:text-emerald-500">Live</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-zinc-100 dark:border-zinc-800 text-xs text-zinc-400 dark:text-zinc-600">
            <Watch className="w-3 h-3" />
            Garmin
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600 ml-0.5" />
            Planned
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-zinc-100 dark:border-zinc-800 text-xs text-zinc-400 dark:text-zinc-600">
            <Heart className="w-3 h-3" />
            Apple Health
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600 ml-0.5" />
            Planned
          </div>
        </div>
      </main>

      {/* Product screenshot mock */}
      <section className="px-6 pb-16 flex justify-center">
        <div className="w-full max-w-3xl rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
          <div className="flex h-72 bg-white dark:bg-zinc-950">
            {/* Sidebar mock */}
            <div className="w-52 shrink-0 border-r border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 pb-2 border-b border-zinc-100 dark:border-zinc-800">
                <div className="w-4 h-4 rounded bg-zinc-200 dark:bg-zinc-700 shrink-0" />
                <div className="h-3 w-20 rounded bg-zinc-100 dark:bg-zinc-800" />
              </div>
              <div className="space-y-2">
                <div className="h-3 w-36 rounded bg-zinc-100 dark:bg-zinc-800" />
                <div className="h-3 w-28 rounded bg-zinc-100 dark:bg-zinc-800" />
                <div className="h-3 w-32 rounded bg-zinc-100 dark:bg-zinc-800" />
              </div>
            </div>
            {/* Chat mock */}
            <div className="flex-1 flex flex-col">
              <div className="border-b border-zinc-100 dark:border-zinc-800 px-5 py-3">
                <div className="h-3 w-40 rounded bg-zinc-100 dark:bg-zinc-800" />
              </div>
              <div className="flex-1 px-5 py-4 space-y-4 overflow-hidden">
                {/* User message */}
                <div className="flex justify-end">
                  <div className="text-xs text-zinc-700 dark:text-zinc-300 max-w-xs text-right bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-3 py-2">
                    How did my long rides this month compare to last month?
                  </div>
                </div>
                {/* Agent response */}
                <div className="space-y-1.5 max-w-sm">
                  <div className="text-[10px] text-zinc-400 font-medium">Training Chat</div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Your long rides in March improved significantly. Average distance was{" "}
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">68.2 km</span> vs 54.1 km in February (+26%), and average power climbed from 187W to{" "}
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">198W</span> (+6%). You&apos;re trending well ahead of your spring target.
                  </div>
                </div>
              </div>
              {/* Input mock */}
              <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 py-3">
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-xs text-zinc-400">
                  Ask about your training…
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="pb-5 text-center">
        <span className="text-[11px] text-zinc-300 dark:text-zinc-700 select-none">BP° works</span>
      </footer>
    </div>
  );
}
