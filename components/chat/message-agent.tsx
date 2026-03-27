"use client";

import { useState, useEffect } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { ReasoningStateRow } from "@/components/chat/reasoning-state";
import { ChartBlock } from "@/components/chat/chart-block";
import { cn } from "@/lib/utils";
import type { AgentMessage, ReasoningState } from "@/types";

interface MessageAgentProps {
  message: AgentMessage;
  isStreaming?: boolean;
}

export function MessageAgent({ message, isStreaming }: MessageAgentProps) {
  // null = follow streaming state; true/false = user manually toggled
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null);

  // Reset manual override whenever a new stream starts
  useEffect(() => {
    if (isStreaming) setUserExpanded(null);
  }, [isStreaming]);

  // Expand while streaming, collapse when done
  const isExpanded = userExpanded ?? !!isStreaming;

  const hasStates = message.states.length > 0;

  // Show "Composing answer..." after all tool steps complete but before text arrives
  const allToolsDone = hasStates && message.states.every((s) => s.status === "done");
  const showComposing = isStreaming && allToolsDone && !message.final_answer;

  const composingState: ReasoningState = {
    id: "composing",
    label: "Composing answer",
    status: "active",
  };

  // Summary label for the collapsed header
  const activeState = message.states.find((s) => s.status === "active");
  const doneCount = message.states.filter((s) => s.status === "done").length;

  function headerLabel() {
    if (showComposing) return "Composing answer";
    if (isStreaming && activeState) return activeState.label;
    if (isStreaming && message.states[0]?.id === "planning") return "Planning";
    const toolCount = message.states.filter(
      (s) => s.id !== "planning" && s.status === "done"
    ).length;
    if (toolCount === 0) return "Thinking";
    return `Used ${toolCount} tool${toolCount !== 1 ? "s" : ""}`;
  }

  return (
    <div className="mb-6">
      {/* Collapsible reasoning steps */}
      {hasStates && (
        <div className="mb-3">
          {/* Header / toggle */}
          <button
            onClick={() => setUserExpanded((prev) => !(prev ?? !!isStreaming))}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 transition-colors mb-1.5 group"
          >
            {isStreaming && !showComposing && doneCount < message.states.filter(s => s.id !== "planning").length ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : showComposing ? (
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

          {/* Expandable steps */}
          {isExpanded && (
            <div className="flex flex-col gap-1.5">
              {message.states.map((state) => (
                <ReasoningStateRow key={state.id} state={state} />
              ))}
              {showComposing && <ReasoningStateRow key="composing" state={composingState} />}
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
