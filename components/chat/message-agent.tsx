"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ReasoningStateRow } from "@/components/chat/reasoning-state";
import { ChartBlock } from "@/components/chat/chart-block";
import { cn } from "@/lib/utils";
import type { AgentMessage } from "@/types";

interface MessageAgentProps {
  message: AgentMessage;
  isStreaming?: boolean;
}

export function MessageAgent({ message, isStreaming }: MessageAgentProps) {
  const showSkeletons =
    isStreaming && !message.final_answer && message.states.length === 0;

  return (
    <div className="mb-6">
      {/* Reasoning states */}
      {message.states.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-2">
          {message.states.map((state) => (
            <ReasoningStateRow key={state.id} state={state} />
          ))}
        </div>
      )}

      {/* Chart */}
      {message.chart && <ChartBlock chart={message.chart} />}

      {/* Final answer or streaming skeleton */}
      {showSkeletons ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
      ) : message.final_answer ? (
        <p
          className={cn(
            "text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap mt-3",
            isStreaming && "streaming-cursor"
          )}
        >
          {message.final_answer}
        </p>
      ) : null}
    </div>
  );
}
