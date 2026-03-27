"use client";

import { useState, useEffect } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { ReasoningStateRow } from "@/components/chat/reasoning-state";
import { ChartBlock } from "@/components/chat/chart-block";
import { cn } from "@/lib/utils";
import type { AgentMessage } from "@/types";

interface MessageAgentProps {
  message: AgentMessage;
  isStreaming?: boolean;
}

export function MessageAgent({ message, isStreaming }: MessageAgentProps) {
  // null = follow default (collapsed); true/false = user manually toggled
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null);

  // Reset manual override whenever a new stream starts
  useEffect(() => {
    if (isStreaming) setUserExpanded(null);
  }, [isStreaming]);

  // Always collapsed by default — user opts in to see the trace
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

  return (
    <div className="mb-6">
      {/* Collapsible reasoning steps */}
      {hasStates && (
        <div className="mb-3">
          <button
            onClick={() => setUserExpanded((prev) => !(prev ?? false))}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 transition-colors mb-1.5 group"
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
        <p
          className={cn(
            "text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap",
            isStreaming && "streaming-cursor"
          )}
        >
          {message.final_answer}
        </p>
      )}
    </div>
  );
}
