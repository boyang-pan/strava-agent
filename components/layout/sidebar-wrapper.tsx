"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import type { Conversation } from "@/types";

export function SidebarWrapper() {
  const router = useRouter();
  const pathname = usePathname();
  const [conversations, setConversations] = useState<Conversation[]>([]);

  // Derive activeId from the current path
  const activeId = pathname.startsWith("/chat/")
    ? pathname.replace("/chat/", "")
    : null;

  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setConversations(data);
      })
      .catch(() => {});
  }, [pathname]); // Re-fetch when route changes (e.g. after new conversation)

  async function handleNew() {
    const res = await fetch("/api/conversations", { method: "POST" });
    const data = await res.json();
    if (data?.id) {
      router.push(`/chat/${data.id}`);
    }
  }

  function handleSelect(id: string) {
    router.push(`/chat/${id}`);
  }

  return (
    <Sidebar
      conversations={conversations}
      activeId={activeId}
      onSelect={handleSelect}
      onNew={handleNew}
    />
  );
}
