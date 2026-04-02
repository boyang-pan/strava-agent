"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

// ---- Types ----

interface SyncJob {
  phase: number;
  status: "running" | "completed" | "failed";
  total: number | null;
  synced: number;
  error: string | null;
  started_at: string;
  updated_at: string;
}

interface SyncData {
  phase1: SyncJob | null;
  phase2: SyncJob | null;
}

// ---- Sync tab ----

function etaLabel(job: SyncJob): string | null {
  if (job.status !== "running" || !job.total) return null;
  const remaining = job.total - job.synced;
  const mins = Math.ceil((remaining / 100) * 15);
  return mins > 60 ? `~${Math.ceil(mins / 60)}h left` : `~${mins}m left`;
}

function RateLimitInfo({ tip }: { tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="w-3 h-3 text-zinc-400 dark:text-zinc-500 shrink-0 cursor-default" />
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-[220px] text-xs">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

function SyncPhaseDetail({
  title,
  includes,
  job,
  waiting,
  rateLimitTip,
}: {
  title: string;
  includes: string;
  job: SyncJob | null;
  waiting?: boolean;
  rateLimitTip?: string;
}) {
  if (!job && waiting) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{title}</p>
            {rateLimitTip && <RateLimitInfo tip={rateLimitTip} />}
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">Waiting...</p>
        </div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">{includes}</p>
      </div>
    );
  }

  if (!job) return null;

  const { status, synced, total } = job;
  const pct = total && total > 0 ? Math.round((synced / total) * 100) : null;
  const eta = etaLabel(job);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{title}</p>
          {rateLimitTip && <RateLimitInfo tip={rateLimitTip} />}
        </div>
        {status === "completed" && (
          <span className="text-xs text-green-500 flex items-center gap-1">
            ✓ {synced.toLocaleString()} synced
          </span>
        )}
        {status === "failed" && (
          <span className="text-xs text-red-500">Failed</span>
        )}
        {status === "running" && (
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            {total ? `${synced.toLocaleString()} / ${total.toLocaleString()}` : `${synced.toLocaleString()}…`}
            {eta && <span className="ml-1 text-zinc-400 dark:text-zinc-600">{eta}</span>}
          </span>
        )}
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">{includes}</p>
      {status === "running" && (
        <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-500 rounded-full transition-all duration-500"
            style={{ width: pct !== null ? `${pct}%` : "5%" }}
          />
        </div>
      )}
    </div>
  );
}

function SyncTab() {
  const [data, setData] = useState<SyncData | null>(null);

  const fetchStatus = () => {
    fetch("/api/sync-status")
      .then((r) => r.json())
      .then((d: SyncData) => setData(d))
      .catch(() => {});
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    if (!data) return;
    const anyRunning = data.phase1?.status === "running" || data.phase2?.status === "running";
    if (!anyRunning) return;
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, [data]);

  const lastSynced = data?.phase2?.updated_at ?? data?.phase1?.updated_at;

  return (
    <div className="space-y-5 py-2">
      <SyncPhaseDetail
        title="Phase 1 — Activity summaries"
        includes="Name, date, distance, time, elevation, heart rate, pace, power"
        job={data?.phase1 ?? null}
      />

      <Separator />

      <SyncPhaseDetail
        title="Phase 2 — Enrichment"
        includes="Calories, max power, description"
        job={data?.phase2 ?? null}
        waiting={!!data?.phase1}
        rateLimitTip="Strava limits API requests to 100 per 15 minutes and 1,000 per day. Phase 2 fetches one request per activity, so 1,000 activities takes ~2.5 hours."
      />

      <Separator />

      <SyncPhaseDetail
        title="Phase 3 — Segment efforts"
        includes="Segment times, PR rank, power and HR per segment"
        job={null}
        waiting={!!data?.phase1}
        rateLimitTip="Segment efforts are extracted from the same requests as Phase 2 — no extra API calls needed. They sync automatically alongside enrichment."
      />

      {lastSynced && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500 pt-1">
          Last updated:{" "}
          {new Date(lastSynced).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      )}

      {!data?.phase1 && (
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          No sync data yet. Connect your Strava account to get started.
        </p>
      )}
    </div>
  );
}

// ---- Settings tab ----

function SettingsTab({
  userEmail,
  onLogout,
  onClose,
}: {
  userEmail: string;
  onLogout: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [displayName, setDisplayName] = useState("");
  const [nameLoading, setNameLoading] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Load current display name from user metadata
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setDisplayName(data.user?.user_metadata?.full_name ?? "");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setNameLoading(true);
    setNameMsg(null);
    const { error } = await supabase.auth.updateUser({ data: { full_name: displayName.trim() } });
    setNameMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Name updated." });
    setNameLoading(false);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPwMsg({ ok: false, text: "Passwords do not match." });
      return;
    }
    if (newPassword.length < 6) {
      setPwMsg({ ok: false, text: "Password must be at least 6 characters." });
      return;
    }
    setPwLoading(true);
    setPwMsg(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error) {
      setNewPassword("");
      setConfirmPassword("");
    }
    setPwMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Password updated." });
    setPwLoading(false);
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== "DELETE") return;
    setDeleteLoading(true);
    await supabase.auth.signOut();
    await fetch("/api/account", { method: "DELETE" });
    router.push("/login");
    onClose();
  }

  return (
    <div className="space-y-6 py-2">
      {/* Profile */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Profile</h3>
        <form onSubmit={handleSaveName} className="space-y-2">
          <div className="space-y-1">
            <label className="text-xs text-zinc-500 dark:text-zinc-400">Display name</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-500 dark:text-zinc-400">Email</label>
            <Input value={userEmail} disabled className="opacity-60" />
          </div>
          {nameMsg && (
            <p className={`text-xs ${nameMsg.ok ? "text-green-600" : "text-red-500"}`}>{nameMsg.text}</p>
          )}
          <Button type="submit" size="sm" disabled={nameLoading}>
            {nameLoading ? "Saving…" : "Save"}
          </Button>
        </form>
      </div>

      <Separator />

      {/* Password */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Change password</h3>
        <form onSubmit={handleChangePassword} className="space-y-2">
          <Input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
          <Input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
          {pwMsg && (
            <p className={`text-xs ${pwMsg.ok ? "text-green-600" : "text-red-500"}`}>{pwMsg.text}</p>
          )}
          <Button type="submit" size="sm" disabled={pwLoading}>
            {pwLoading ? "Updating…" : "Update password"}
          </Button>
        </form>
      </div>

      <Separator />

      {/* Account actions */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Account</h3>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onLogout}
        >
          Sign out
        </Button>

        <div className="space-y-2 pt-2">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            To delete your account, type <strong>DELETE</strong> below. This is permanent and cannot be undone.
          </p>
          <Input
            placeholder='Type "DELETE" to confirm'
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
          />
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            disabled={deleteConfirm !== "DELETE" || deleteLoading}
            onClick={handleDeleteAccount}
          >
            {deleteLoading ? "Deleting…" : "Delete account"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---- Modal ----

interface AccountModalProps {
  open: boolean;
  onClose: () => void;
  userEmail: string;
  onLogout: () => void;
  defaultTab?: "sync" | "settings";
}

export function AccountModal({ open, onClose, userEmail, onLogout, defaultTab = "sync" }: AccountModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Account</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue={defaultTab}>
          <TabsList className="w-full">
            <TabsTrigger value="sync" className="flex-1">Data Sync</TabsTrigger>
            <TabsTrigger value="settings" className="flex-1">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="sync">
            <SyncTab />
          </TabsContent>
          <TabsContent value="settings">
            <SettingsTab userEmail={userEmail} onLogout={onLogout} onClose={onClose} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
