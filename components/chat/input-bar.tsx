"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InputBarProps {
  onSubmit: (value: string) => void;
  disabled?: boolean;
}

export function InputBar({ onSubmit, disabled }: InputBarProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus on mount and whenever streaming finishes (disabled: true → false)
  const prevDisabled = useRef(disabled);
  useEffect(() => {
    if (prevDisabled.current && !disabled) {
      textareaRef.current?.focus();
    }
    prevDisabled.current = disabled;
  }, [disabled]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div
      className={cn(
        "border border-zinc-200 dark:border-zinc-700 rounded-lg flex items-end gap-2 p-2 transition-colors",
        "focus-within:border-zinc-400 dark:focus-within:border-zinc-500"
      )}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          adjustHeight();
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Ask about your training..."
        rows={1}
        className={cn(
          "flex-1 resize-none text-sm bg-transparent outline-none border-0 focus:ring-0",
          "placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-zinc-900 dark:text-zinc-100",
          "min-h-[40px] max-h-[160px] py-2 px-1 leading-relaxed",
          "disabled:opacity-50"
        )}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleSubmit}
        disabled={!value.trim() || disabled}
        className="shrink-0 h-8 w-8 text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-30"
      >
        <ArrowUp className="w-4 h-4" />
      </Button>
    </div>
  );
}
