"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MessageUser } from "@/components/chat/message-user";
import { MessageAgent } from "@/components/chat/message-agent";
import { InputBar } from "@/components/chat/input-bar";
import { EmptyState } from "@/components/chat/empty-state";
import type { AgentMessage, Conversation, Message } from "@/types";

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
  const scrollRef = useRef<HTMLDivElement>(null);

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

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, history, conversation_id: conversationId }),
        });

        if (!res.ok || !res.body) throw new Error("Stream failed");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentAgentMsg: AgentMessage = { ...initialAgentMsg };

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
          };
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === agentMsgId ? { ...m, content: currentAgentMsg } : m
          )
        );

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
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, messages, conversationId, hasTitleBeenSet]
  );

  const lastAgentMsgId =
    messages.filter((m) => m.role === "assistant").at(-1)?.id ?? null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-zinc-100 px-6 py-3 shrink-0">
        <p className="text-sm font-medium text-zinc-900">
          {conversationTitle ?? (messages.length > 0 ? "Conversation" : "New conversation")}
        </p>
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
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-zinc-100 p-4 shrink-0">
        <div className="max-w-2xl mx-auto">
          <InputBar onSubmit={handleSubmit} disabled={isLoading} />
          <p className="text-xs text-zinc-400 text-center mt-2">
            Notes from past conversations are always remembered.
          </p>
        </div>
      </div>
    </div>
  );
}
