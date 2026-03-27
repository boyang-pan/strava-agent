"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import type { Conversation } from "@/types";

export function SidebarWrapper() {
  const router = useRouter();
  const pathname = usePathname();
  const [conversations, setConversations] = useState<Conversation[]>([]);

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
  }, [pathname]);

  async function handleNew() {
    const res = await fetch("/api/conversations", { method: "POST" });
    const data = await res.json();
    if (data?.id) router.push(`/chat/${data.id}`);
  }

  function handleSelect(id: string) {
    router.push(`/chat/${id}`);
  }

  async function handleDelete(id: string) {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (activeId === id) router.push("/chat");
  }

  async function handleRename(id: string, title: string) {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c))
    );
    window.dispatchEvent(new CustomEvent("conversation:renamed", { detail: { id, title } }));
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  }

  return (
    <Sidebar
      conversations={conversations}
      activeId={activeId}
      onSelect={handleSelect}
      onNew={handleNew}
      onDelete={handleDelete}
      onRename={handleRename}
    />
  );
}
