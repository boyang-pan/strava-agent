"use client";

interface MessageUserProps {
  content: string;
}

export function MessageUser({ content }: MessageUserProps) {
  return (
    <div className="flex justify-end mb-4">
      <div className="bg-zinc-900 dark:bg-zinc-700 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm max-w-[70%] leading-relaxed">
        {content}
      </div>
    </div>
  );
}
