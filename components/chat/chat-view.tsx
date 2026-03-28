"use client";

import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import { MessageUser } from "@/components/chat/message-user";
import { MessageAgent } from "@/components/chat/message-agent";
import { InputBar } from "@/components/chat/input-bar";
import { EmptyState } from "@/components/chat/empty-state";
import type { AgentMessage, Conversation, Message } from "@/types";
import { useSidebar } from "@/components/layout/resizable-layout";
import { PanelLeftOpen, Pencil, ChevronDown, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

interface LocalMessage {
  id: string;
  role: "user" | "assistant";
  content: string | AgentMessage;
}

interface ChatViewProps {
  conversationId: string | null;
}

let msgCounter = 0;
function newId() {
  return `msg-${++msgCounter}-${Date.now()}`;
}

/**
 * Parse stream lines into AgentMessage updates.
 * Protocol:
 *   p:{steps}       — plan (ignored; no longer shown as pending states)
 *   0:"text chunk"  — text delta
 *   9:{...}         — tool call
 *   a:{...}         — tool result
 *   b:{...}         — tool call (alternate prefix)
 *   e:{message}     — error
 *   d:{...}         — finish event
 */
function parseStreamLine(
  line: string,
  current: AgentMessage
): { updated: AgentMessage; done: boolean } {
  const updated: AgentMessage = {
    ...current,
    states: [...current.states],
  };

  if (line.startsWith("p:")) {
    // Plan line — ignored; we no longer pre-populate pending states
    return { updated, done: false };
  }

  if (line.startsWith("0:")) {
    try {
      const chunk = JSON.parse(line.slice(2)) as string;
      updated.final_answer = (updated.final_answer ?? "") + chunk;
    } catch {
      // ignore parse errors
    }
    return { updated, done: false };
  }

  if (line.startsWith("9:") || line.startsWith("b:")) {
    // Tool call — remove "Planning" placeholder on first real tool, then append
    try {
      const payload = JSON.parse(line.slice(2));
      const toolName: string = payload.toolName ?? payload.tool ?? "tool";
      const input = payload.args ?? payload.input ?? {};
      updated.states = updated.states.filter((s) => s.id !== "planning");
      updated.states.push({
        id: `state-${updated.states.length}`,
        label: labelForTool(toolName, input),
        status: "active",
        toolCall: { tool: toolName, input, output: undefined },
      });
    } catch {
      // ignore
    }
    return { updated, done: false };
  }

  if (line.startsWith("a:")) {
    // Tool result — mark the last active state as done
    try {
      const payload = JSON.parse(line.slice(2));
      const output = payload.result ?? payload.output;
      const lastActiveIdx = [...updated.states]
        .reverse()
        .findIndex((s) => s.status === "active");
      if (lastActiveIdx >= 0) {
        const idx = updated.states.length - 1 - lastActiveIdx;
        updated.states[idx] = {
          ...updated.states[idx],
          status: "done",
          toolCall: updated.states[idx].toolCall
            ? { ...updated.states[idx].toolCall!, output }
            : undefined,
        };
        if (
          updated.states[idx].toolCall?.tool === "render_chart" &&
          output &&
          typeof output === "object"
        ) {
          updated.chart = output as AgentMessage["chart"];
        }
      }
    } catch {
      // ignore
    }
    return { updated, done: false };
  }

  if (line.startsWith("e:")) {
    try {
      const payload = JSON.parse(line.slice(2)) as { message: string };
      updated.final_answer = payload.message;
      updated.error = true;
    } catch {}
    return { updated, done: true };
  }

  if (line.startsWith("d:")) {
    return { updated, done: true };
  }

  return { updated, done: false };
}

function labelForTool(toolName: string, input: Record<string, unknown>): string {
  const labels: Record<string, string> = {
    get_schema: "Reading the database schema",
    get_date_context: "Checking today's date",
    run_query: "Running a query",
    get_activity_detail: "Getting activity detail",
    get_personal_records: "Fetching personal records",
    get_notes: "Checking your notes",
    add_note: "Saving a note",
    render_chart: "Preparing chart",
    ask_user: "Asking a clarifying question",
  };

  if (toolName === "run_query" && input?.sql) {
    const sql = String(input.sql).trim().toLowerCase();
    if (sql.includes("week")) return "Querying weekly data";
    if (sql.includes("month")) return "Querying monthly data";
    if (sql.includes("pace") || sql.includes("speed")) return "Querying pace data";
    if (sql.includes("heartrate")) return "Querying heart rate data";
  }

  return labels[toolName] ?? toolName;
}

export function ChatView({ conversationId }: ChatViewProps) {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);
  const [hasTitleBeenSet, setHasTitleBeenSet] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastQuestionRef = useRef<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Load existing messages + title when conversationId changes
  useEffect(() => {
    setMessages([]);
    setConversationTitle(null);
    setHasTitleBeenSet(false);

    if (!conversationId) return;

    // Fetch messages
    fetch(`/api/conversations/${conversationId}`)
      .then((r) => r.json())
      .then((data: Message[]) => {
        if (!Array.isArray(data)) return;
        const loaded: LocalMessage[] = data.map((m) => ({
          id: m.id,
          role: m.role,
          content:
            m.role === "user"
              ? typeof m.content === "string"
                ? m.content
                : JSON.stringify(m.content)
              : (m.content as AgentMessage),
        }));
        setMessages(loaded);
        if (loaded.length > 0) setHasTitleBeenSet(true);
      })
      .catch(() => {});

    // Fetch title for this conversation
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((data: Conversation[]) => {
        const match = data.find((c) => c.id === conversationId);
        if (match?.title) setConversationTitle(match.title);
      })
      .catch(() => {});
  }, [conversationId]);

  // Auto-select input text when title editing starts
  useLayoutEffect(() => {
    if (isEditingTitle) titleInputRef.current?.select();
  }, [isEditingTitle]);

  function startEditingTitle() {
    if (!conversationId) return;
    setTitleDraft(conversationTitle ?? "");
    setIsEditingTitle(true);
  }

  function commitTitleRename() {
    const trimmed = titleDraft.trim();
    setIsEditingTitle(false);
    if (!trimmed || trimmed === conversationTitle || !conversationId) return;
    setConversationTitle(trimmed);
    setHasTitleBeenSet(true);
    window.dispatchEvent(new CustomEvent("conversation:renamed", { detail: { id: conversationId, title: trimmed } }));
    fetch(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    }).catch(() => {});
  }

  function handleTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commitTitleRename();
    if (e.key === "Escape") setIsEditingTitle(false);
  }

  // Sync title when renamed from the sidebar
  useEffect(() => {
    function onRenamed(e: Event) {
      const { id, title } = (e as CustomEvent<{ id: string; title: string }>).detail;
      if (id === conversationId) setConversationTitle(title);
    }
    window.addEventListener("conversation:renamed", onRenamed);
    return () => window.removeEventListener("conversation:renamed", onRenamed);
  }, [conversationId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = useCallback(
    async (question: string) => {
      if (isLoading) return;

      const userMsgId = newId();
      const agentMsgId = newId();

      lastQuestionRef.current = question;
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: "user", content: question },
      ]);
      setIsLoading(true);

      const history = messages.slice(-10).map((m) => ({
        role: m.role,
        content:
          typeof m.content === "string"
            ? m.content
            : (m.content as AgentMessage).final_answer ?? "",
      }));

      // "Planning" spinner shown immediately while Phase 1 runs
      const initialAgentMsg: AgentMessage = {
        states: [{ id: "planning", label: "Planning", status: "active" }],
        final_answer: "",
      };
      setMessages((prev) => [
        ...prev,
        { id: agentMsgId, role: "assistant", content: initialAgentMsg },
      ]);

      const streamStartTime = Date.now();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      let currentAgentMsg: AgentMessage = { ...initialAgentMsg };

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, history, conversation_id: conversationId }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) throw new Error("Stream failed");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            const { updated, done: streamDone } = parseStreamLine(line, currentAgentMsg);
            currentAgentMsg = updated;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsgId ? { ...m, content: { ...currentAgentMsg } } : m
              )
            );
            if (streamDone) break;
          }
        }

        // Record elapsed time
        const duration_ms = Date.now() - streamStartTime;

        // Mark all remaining active states as done
        currentAgentMsg = {
          ...currentAgentMsg,
          duration_ms,
          states: currentAgentMsg.states.map((s) =>
            s.status === "active" ? { ...s, status: "done" } : s
          ),
        };

        // Guard: if only the "planning" placeholder remains with no answer,
        // a silent Phase 2 error occurred.
        const hasOnlyPlanning =
          currentAgentMsg.states.length === 1 &&
          currentAgentMsg.states[0].id === "planning";
        if (hasOnlyPlanning && !currentAgentMsg.final_answer) {
          currentAgentMsg = {
            ...currentAgentMsg,
            final_answer: "Something went wrong. Please try again.",
            error: true,
          };
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === agentMsgId ? { ...m, content: currentAgentMsg } : m
          )
        );

        // Fire-and-forget message persistence
        if (conversationId) {
          fetch(`/api/conversations/${conversationId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [
                { role: "user", content: question },
                { role: "assistant", content: currentAgentMsg },
              ],
            }),
          }).catch(() => {});
        }

        // Fire-and-forget title generation
        if (conversationId && !hasTitleBeenSet) {
          setHasTitleBeenSet(true);
          fetch("/api/title", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              conversation_id: conversationId,
              question,
              answer: currentAgentMsg.final_answer,
            }),
          })
            .then((r) => r.json())
            .then((data) => {
              if (data?.title) setConversationTitle(data.title);
            })
            .catch(() => {});
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === agentMsgId
                ? {
                    ...m,
                    content: {
                      ...currentAgentMsg,
                      states: currentAgentMsg.states.map((s) =>
                        s.status === "active" ? { ...s, status: "done" } : s
                      ),
                      final_answer: currentAgentMsg.final_answer || "*(stopped)*",
                    } as AgentMessage,
                  }
                : m
            )
          );
        } else {
          console.error("Agent stream error:", err);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === agentMsgId
                ? {
                    ...m,
                    content: {
                      states: [],
                      final_answer: "Something went wrong. Please try again.",
                    } as AgentMessage,
                  }
                : m
            )
          );
        }
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, messages, conversationId, hasTitleBeenSet]
  );

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const lastAgentMsgId =
    messages.filter((m) => m.role === "assistant").at(-1)?.id ?? null;
  const sidebar = useSidebar();
  const router = useRouter();

  async function handleDeleteConversation() {
    if (!conversationId) return;
    await fetch(`/api/conversations/${conversationId}`, { method: "DELETE" }).catch(() => {});
    router.push("/chat");
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-zinc-100 dark:border-zinc-800 px-4 py-3 shrink-0 flex items-center gap-2">
        {sidebar?.isCollapsed && (
          <button
            onClick={sidebar.toggle}
            title="Show sidebar"
            className="p-1 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}
        {conversationId ? (
          isEditingTitle ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitleRename}
              onKeyDown={handleTitleKeyDown}
              autoFocus
              className="text-sm font-medium text-zinc-900 dark:text-zinc-100 bg-transparent outline-none border-b border-zinc-300 dark:border-zinc-600 min-w-0 max-w-xs"
            />
          ) : (
            <DropdownMenu>
              <div className="flex items-center border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
                <span className="pl-3 pr-2 py-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap max-w-xs truncate">
                  {conversationTitle ?? "New conversation"}
                </span>
                <DropdownMenuTrigger asChild>
                  <button className="border-l border-zinc-200 dark:border-zinc-700 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors focus:outline-none">
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                  </button>
                </DropdownMenuTrigger>
              </div>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={startEditingTitle}>
                  <Pencil className="w-3.5 h-3.5" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleDeleteConversation} destructive>
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        ) : (
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">New conversation</p>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        {messages.length === 0 ? (
          <EmptyState onPrompt={handleSubmit} />
        ) : (
          <div className="max-w-2xl mx-auto px-6 py-6">
            {messages.map((msg) => {
              if (msg.role === "user") {
                return (
                  <MessageUser
                    key={msg.id}
                    content={msg.content as string}
                  />
                );
              }
              return (
                <MessageAgent
                  key={msg.id}
                  message={msg.content as AgentMessage}
                  isStreaming={isLoading && msg.id === lastAgentMsgId}
                  onRetry={
                    msg.id === lastAgentMsgId && (msg.content as AgentMessage).error
                      ? () => handleSubmit(lastQuestionRef.current)
                      : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-zinc-100 dark:border-zinc-800 p-4 shrink-0">
        <div className="max-w-2xl mx-auto">
          <InputBar key={conversationId ?? "new"} onSubmit={handleSubmit} disabled={isLoading} onStop={handleStop} />
          <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center mt-2">
            Notes from past conversations are always remembered.
          </p>
        </div>
      </div>
    </div>
  );
}
