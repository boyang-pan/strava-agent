import { Activity, Watch, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ConnectStravaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 px-4">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Connect your training data</h1>
          <p className="text-sm text-muted-foreground">
            Choose a source to sync your activities. More integrations coming soon.
          </p>
        </div>

        <ConnectError searchParams={searchParams} />

        <div className="space-y-3">
          {/* Strava — active */}
          <div className="flex items-center gap-4 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
            <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Strava</div>
              <div className="text-xs text-muted-foreground">Runs, rides, and all activities</div>
            </div>
            <Button size="sm" asChild>
              <a href="/api/strava/connect">Connect</a>
            </Button>
          </div>

          {/* Garmin — coming soon */}
          <div className="flex items-center gap-4 rounded-xl border border-zinc-100 dark:border-zinc-800/50 p-4 opacity-50 cursor-not-allowed select-none">
            <div className="w-9 h-9 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-center shrink-0">
              <Watch className="w-4 h-4 text-zinc-400 dark:text-zinc-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-500 dark:text-zinc-500">Garmin Connect</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-600 leading-none">
                  Coming soon
                </span>
              </div>
              <div className="text-xs text-muted-foreground/60">GPS watches and fitness devices</div>
            </div>
            <Button size="sm" disabled variant="outline">Connect</Button>
          </div>

          {/* Apple Health — coming soon */}
          <div className="flex items-center gap-4 rounded-xl border border-zinc-100 dark:border-zinc-800/50 p-4 opacity-50 cursor-not-allowed select-none">
            <div className="w-9 h-9 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-center shrink-0">
              <Heart className="w-4 h-4 text-zinc-400 dark:text-zinc-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-500 dark:text-zinc-500">Apple Health</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-600 leading-none">
                  Coming soon
                </span>
              </div>
              <div className="text-xs text-muted-foreground/60">Workouts, steps, and health metrics</div>
            </div>
            <Button size="sm" disabled variant="outline">Connect</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

async function ConnectError({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  if (!error) return null;

  const messages: Record<string, string> = {
    token_exchange_failed: "Failed to exchange authorization code with Strava. Please try again.",
    db_error: "Failed to save your connection. Please try again.",
    missing_code: "Authorization was cancelled or no code was received.",
  };

  return (
    <p className="text-sm text-destructive text-center">
      {messages[error] ?? "Something went wrong. Please try again."}
    </p>
  );
}
