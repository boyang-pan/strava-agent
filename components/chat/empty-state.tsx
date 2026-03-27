"use client";

import { Activity } from "lucide-react";

const EXAMPLE_PROMPTS: { label: string; prompt: string }[] = [
  {
    label: "Am I getting faster?",
    prompt: "Am I getting faster? Focus on my running pace over the last 3 months only.",
  },
  {
    label: "Signs of overtraining?",
    prompt: "Are there any signs of overtraining in my recent activity? Look at the last 4 weeks only.",
  },
  {
    label: "Best training month?",
    prompt: "Which was my best training month this year, and why?",
  },
  {
    label: "How do I do after rest days?",
    prompt: "How does my performance compare on runs that follow a rest day vs. consecutive run days? Use the last 2 months of data.",
  },
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
        {EXAMPLE_PROMPTS.map(({ label, prompt }) => (
          <button
            key={label}
            onClick={() => onPrompt(prompt)}
            className="border border-zinc-200 rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 cursor-pointer text-left transition-colors"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
