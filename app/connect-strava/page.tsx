import { Button } from "@/components/ui/button";

export default function ConnectStravaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 px-4 text-center">
        <div className="space-y-2">
          <div className="text-4xl">🚴</div>
          <h1 className="text-2xl font-semibold tracking-tight">Connect Strava</h1>
          <p className="text-sm text-muted-foreground">
            Connect your Strava account to start querying your training data.
            We&apos;ll sync your activities automatically.
          </p>
        </div>

        <ConnectError searchParams={searchParams} />

        <Button asChild className="w-full">
          <a href="/api/strava/connect">Connect Strava account</a>
        </Button>
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
    <p className="text-sm text-destructive">
      {messages[error] ?? "Something went wrong. Please try again."}
    </p>
  );
}
