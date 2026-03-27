"use client";

import { useState } from "react";
import { Check, ChevronDown, Dot, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReasoningState } from "@/types";

interface ReasoningStateRowProps {
  state: ReasoningState;
}

export function ReasoningStateRow({ state }: ReasoningStateRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const canExpand = state.status !== "pending" && state.toolCall !== undefined;

  return (
    <div className="border border-zinc-100 dark:border-zinc-800 rounded-md overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => canExpand && setIsOpen((o) => !o)}
        disabled={!canExpand}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors",
          canExpand ? "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer" : "cursor-default"
        )}
      >
        {/* Status icon */}
        <span className="shrink-0 w-4 h-4 flex items-center justify-center">
          {state.status === "active" && (
            <Loader2 className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 animate-spin" />
          )}
          {state.status === "done" && (
            <Check className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
          )}
          {state.status === "pending" && (
            <Dot className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600" />
          )}
        </span>

        {/* Label */}
        <span className="flex-1 text-sm text-zinc-700 dark:text-zinc-300 truncate">
          {state.label}
        </span>

        {/* Expand chevron */}
        {canExpand && (
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600 shrink-0 transition-transform",
              isOpen && "rotate-180"
            )}
          />
        )}
      </button>

      {/* Expanded panel */}
      {isOpen && state.toolCall && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-3 space-y-2">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 font-tool">
            {state.toolCall.tool}
          </p>

          {state.toolCall.input !== undefined && (
            <div>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 font-tool mb-0.5">input</p>
              <pre className="text-xs text-zinc-500 font-tool whitespace-pre-wrap break-all">
                {JSON.stringify(state.toolCall.input, null, 2)}
              </pre>
            </div>
          )}

          {state.toolCall.output !== undefined && (
            <div>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 font-tool mb-0.5">output</p>
              <div className="max-h-48 overflow-y-auto">
                <pre className="text-xs text-zinc-500 dark:text-zinc-400 font-tool whitespace-pre-wrap break-all">
                  {JSON.stringify(state.toolCall.output, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
