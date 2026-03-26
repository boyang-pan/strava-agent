"use client";

import { Activity } from "lucide-react";

const EXAMPLE_PROMPTS = [
  "Am I getting faster?",
  "Signs of overtraining?",
  "Best training month?",
  "How do I do after rest days?",
];

interface EmptyStateProps {
  onPrompt: (prompt: string) => void;
}

export function EmptyState({ onPrompt }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-6 px-6">
      <Activity className="w-8 h-8 text-zinc-200" />

      <div className="space-y-1">
        <p className="text-base font-semibold text-zinc-900">
          Ask about your training
        </p>
        <p className="text-sm text-zinc-400">
          Notes from past conversations are always remembered.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 max-w-sm w-full">
        {EXAMPLE_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onPrompt(prompt)}
            className="border border-zinc-200 rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 cursor-pointer text-left transition-colors"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
