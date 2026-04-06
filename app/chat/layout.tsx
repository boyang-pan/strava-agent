"use client";

import { useParams } from "next/navigation";
import { ResizableLayout } from "@/components/layout/resizable-layout";
import { SidebarWrapper } from "@/components/layout/sidebar-wrapper";
import { ChatView } from "@/components/chat/chat-view";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const conversationId =
    typeof params?.conversationId === "string" ? params.conversationId : null;

  return (
    <ResizableLayout sidebar={<SidebarWrapper />}>
      {/* children is null (pages return null) — rendered to satisfy Next.js routing */}
      <div style={{ display: "none" }}>{children}</div>
      <ChatView conversationId={conversationId} />
    </ResizableLayout>
  );
}
