"use client";

import { Activity, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn, groupByRecency } from "@/lib/utils";
import type { Conversation } from "@/types";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

function relativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
}: {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left px-3 py-2 rounded-md transition-colors",
        isActive
          ? "bg-zinc-100 text-zinc-900"
          : "text-zinc-700 hover:bg-zinc-50"
      )}
    >
      <p
        className={cn(
          "text-sm truncate leading-snug",
          isActive ? "font-medium" : "font-normal",
          !conversation.title && "italic text-zinc-400"
        )}
      >
        {conversation.title ?? "New conversation"}
      </p>
      <p className="text-xs text-zinc-400 mt-0.5">
        {relativeTime(conversation.created_at)}
      </p>
    </button>
  );
}

function GroupLabel({ label }: { label: string }) {
  return (
    <p className="text-xs text-zinc-400 uppercase tracking-wide px-3 pt-3 pb-1">
      {label}
    </p>
  );
}

export function Sidebar({ conversations, activeId, onSelect, onNew }: SidebarProps) {
  const groups = groupByRecency(conversations);

  return (
    <div className="w-60 border-r border-zinc-100 flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-4">
        <Activity className="w-4 h-4 text-zinc-400" />
        <span className="text-sm font-semibold text-zinc-900">Strava Agent</span>
      </div>

      {/* New conversation */}
      <div className="px-3 pb-3">
        <Button
          variant="outline"
          className="w-full justify-start gap-2 border-zinc-200 text-zinc-700 font-normal"
          onClick={onNew}
        >
          <Plus className="w-4 h-4" />
          New conversation
        </Button>
      </div>

      <Separator className="bg-zinc-100" />

      {/* Conversation list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-1.5 pb-2">
          {conversations.length === 0 && (
            <p className="text-xs text-zinc-400 px-3 pt-4 text-center">
              No conversations yet
            </p>
          )}

          {groups.today.length > 0 && (
            <>
              <GroupLabel label="Today" />
              {groups.today.map((c) => (
                <ConversationItem
                  key={c.id}
                  conversation={c}
                  isActive={c.id === activeId}
                  onSelect={() => onSelect(c.id)}
                />
              ))}
            </>
          )}

          {groups.thisWeek.length > 0 && (
            <>
              <GroupLabel label="This week" />
              {groups.thisWeek.map((c) => (
                <ConversationItem
                  key={c.id}
                  conversation={c}
                  isActive={c.id === activeId}
                  onSelect={() => onSelect(c.id)}
                />
              ))}
            </>
          )}

          {groups.earlier.length > 0 && (
            <>
              <GroupLabel label="Earlier" />
              {groups.earlier.map((c) => (
                <ConversationItem
                  key={c.id}
                  conversation={c}
                  isActive={c.id === activeId}
                  onSelect={() => onSelect(c.id)}
                />
              ))}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-zinc-100">
        <p className="text-xs text-zinc-400">strava agent</p>
      </div>
    </div>
  );
}
