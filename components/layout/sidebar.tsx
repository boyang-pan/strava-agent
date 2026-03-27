"use client";

import { useState, useRef, useEffect } from "react";
import { Activity, Plus, Trash2, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
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
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
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
  onDelete,
  onRename,
}: {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(conversation.title ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) inputRef.current?.select();
  }, [isEditing]);

  function startEditing() {
    setDraft(conversation.title ?? "");
    setIsEditing(true);
  }

  function commitRename() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== conversation.title) {
      onRename(trimmed);
    }
    setIsEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commitRename();
    if (e.key === "Escape") setIsEditing(false);
  }

  return (
    <div
      className={cn(
        "group relative w-full rounded-md transition-colors",
        isActive
          ? "bg-zinc-100 dark:bg-zinc-800"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
      )}
    >
      <button
        onClick={onSelect}
        onDoubleClick={startEditing}
        className="w-full text-left px-3 py-2 pr-8"
      >
        {isEditing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="w-full text-sm bg-transparent outline-none border-b border-zinc-300 dark:border-zinc-600 leading-snug text-zinc-900 dark:text-zinc-100"
          />
        ) : (
          <p
            className={cn(
              "text-sm truncate leading-snug",
              isActive
                ? "font-medium text-zinc-900 dark:text-zinc-100"
                : "font-normal text-zinc-700 dark:text-zinc-300",
              !conversation.title && "italic text-zinc-400 dark:text-zinc-500"
            )}
          >
            {conversation.title ?? "New conversation"}
          </p>
        )}
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
          {relativeTime(conversation.created_at)}
        </p>
      </button>

      {/* Delete button — hover reveal */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
        aria-label="Delete conversation"
      >
        <Trash2 className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300" />
      </button>
    </div>
  );
}

function GroupLabel({ label }: { label: string }) {
  return (
    <p className="text-xs text-zinc-400 dark:text-zinc-500 uppercase tracking-wide px-3 pt-3 pb-1">
      {label}
    </p>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="w-6 h-6" />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="p-1.5 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <Sun className="w-3.5 h-3.5" />
      ) : (
        <Moon className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

export function Sidebar({ conversations, activeId, onSelect, onNew, onDelete, onRename }: SidebarProps) {
  const groups = groupByRecency(conversations);

  return (
    <div className="border-r border-zinc-100 dark:border-zinc-800 flex flex-col h-full bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-4">
        <Activity className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Strava Agent</span>
      </div>

      {/* New conversation */}
      <div className="px-3 pb-3">
        <Button
          variant="outline"
          className="w-full justify-start gap-2 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-normal dark:bg-transparent dark:hover:bg-zinc-800"
          onClick={onNew}
        >
          <Plus className="w-4 h-4" />
          New conversation
        </Button>
      </div>

      <Separator className="bg-zinc-100 dark:bg-zinc-800" />

      {/* Conversation list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-1.5 pb-2">
          {conversations.length === 0 && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500 px-3 pt-4 text-center">
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
                  onDelete={() => onDelete(c.id)}
                  onRename={(title) => onRename(c.id, title)}
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
                  onDelete={() => onDelete(c.id)}
                  onRename={(title) => onRename(c.id, title)}
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
                  onDelete={() => onDelete(c.id)}
                  onRename={(title) => onRename(c.id, title)}
                />
              ))}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
        <p className="text-xs text-zinc-400 dark:text-zinc-500">strava agent</p>
        <ThemeToggle />
      </div>
    </div>
  );
}
