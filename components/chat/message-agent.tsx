"use client";

import { useState, useEffect } from "react";
import { ChevronDown, Loader2, Copy, Check, RotateCcw, ListChecks } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ReasoningStateRow } from "@/components/chat/reasoning-state";
import { ChartBlock } from "@/components/chat/chart-block";
import { cn } from "@/lib/utils";
import type { AgentMessage } from "@/types";

interface MessageAgentProps {
  message: AgentMessage;
  isStreaming?: boolean;
  onRetry?: () => void;
}

export function MessageAgent({ message, isStreaming, onRetry }: MessageAgentProps) {
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null);
  const [planExpanded, setPlanExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isStreaming) setUserExpanded(null);
  }, [isStreaming]);

  const isExpanded = userExpanded ?? false;
  const hasStates = message.states.length > 0;
  const activeState = message.states.find((s) => s.status === "active");

  function headerLabel() {
    if (isStreaming) {
      if (activeState) return activeState.label;
      if (message.states[0]?.id === "planning") return "Planning";
      return "Thinking";
    }
    const toolCount = message.states.filter(
      (s) => s.id !== "planning" && s.status === "done"
    ).length;
    const timeStr = message.duration_ms
      ? ` · ${Math.round(message.duration_ms / 1000)}s`
      : "";
    if (toolCount === 0) return `Thinking${timeStr}`;
    return `Used ${toolCount} tool${toolCount !== 1 ? "s" : ""}${timeStr}`;
  }

  function handleCopy() {
    navigator.clipboard.writeText(message.final_answer ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mb-6">
      {/* Collapsible plan */}
      {message.plan && message.plan.steps.length > 0 && (
        <div className="mb-2">
          <button
            onClick={() => setPlanExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors mb-1 group"
          >
            <ChevronDown
              className={cn(
                "w-3 h-3 transition-transform",
                !planExpanded && "-rotate-90"
              )}
            />
            <ListChecks className="w-3 h-3" />
            <span>Plan</span>
          </button>
          {planExpanded && (
            <ol className="ml-5 flex flex-col gap-0.5 list-decimal">
              {message.plan.steps.map((step, i) => (
                <li key={i} className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {step}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Collapsible reasoning steps */}
      {hasStates && (
        <div className="mb-3">
          <button
            onClick={() => setUserExpanded((prev) => !(prev ?? false))}
            className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors mb-1.5 group"
          >
            {isStreaming ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <ChevronDown
                className={cn(
                  "w-3 h-3 transition-transform",
                  !isExpanded && "-rotate-90"
                )}
              />
            )}
            <span>{headerLabel()}</span>
          </button>

          {isExpanded && (
            <div className="flex flex-col gap-1.5">
              {message.states.map((state) => (
                <ReasoningStateRow key={state.id} state={state} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Chart */}
      {message.chart && <ChartBlock chart={message.chart} />}

      {/* Final answer */}
      {message.final_answer && (
        <div className="group/answer relative">
          <div
            className={cn(
              "prose-answer",
              isStreaming && "streaming-cursor"
            )}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => (
                  <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed mb-3 last:mb-0">{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className="text-sm text-zinc-800 dark:text-zinc-200 list-disc pl-4 mb-3 space-y-1">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="text-sm text-zinc-800 dark:text-zinc-200 list-decimal pl-4 mb-3 space-y-1">{children}</ol>
                ),
                li: ({ children }) => (
                  <li className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed">{children}</li>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-zinc-900 dark:text-zinc-100">{children}</strong>
                ),
                em: ({ children }) => (
                  <em className="italic">{children}</em>
                ),
                h1: ({ children }) => (
                  <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-2 mt-4 first:mt-0">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2 mt-4 first:mt-0">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1 mt-3 first:mt-0">{children}</h3>
                ),
                code: ({ children, className }) => {
                  const isBlock = className?.includes("language-");
                  return isBlock ? (
                    <code className="block text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-3 py-2 font-mono overflow-x-auto text-zinc-700 dark:text-zinc-300">
                      {children}
                    </code>
                  ) : (
                    <code className="text-xs bg-zinc-100 dark:bg-zinc-800 rounded px-1 py-0.5 font-mono text-zinc-700 dark:text-zinc-300">{children}</code>
                  );
                },
                pre: ({ children }) => (
                  <pre className="mb-3 last:mb-0">{children}</pre>
                ),
                hr: () => <hr className="border-zinc-200 dark:border-zinc-700 my-3" />,
                table: ({ children }) => (
                  <div className="overflow-x-auto mb-3">
                    <table className="w-full text-sm border-collapse">{children}</table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="border-b border-zinc-200 dark:border-zinc-700">{children}</thead>
                ),
                tbody: ({ children }) => <tbody>{children}</tbody>,
                tr: ({ children }) => (
                  <tr className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">{children}</tr>
                ),
                th: ({ children }) => (
                  <th className="text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide py-2 pr-4 first:pl-0">{children}</th>
                ),
                td: ({ children }) => (
                  <td className="text-sm text-zinc-800 dark:text-zinc-200 py-1.5 pr-4 first:pl-0 whitespace-nowrap">{children}</td>
                ),
              }}
            >
              {message.final_answer}
            </ReactMarkdown>
          </div>

          {!isStreaming && !message.error && (
            <button
              onClick={handleCopy}
              className="absolute -bottom-5 right-0 opacity-0 group-hover/answer:opacity-100 transition-opacity flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              {copied ? (
                <><Check className="w-3 h-3" /> Copied</>
              ) : (
                <><Copy className="w-3 h-3" /> Copy</>
              )}
            </button>
          )}

          {message.error && onRetry && !isStreaming && (
            <button
              onClick={onRetry}
              className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
