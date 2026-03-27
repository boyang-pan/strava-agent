import { ResizableLayout } from "@/components/layout/resizable-layout";
import { SidebarWrapper } from "@/components/layout/sidebar-wrapper";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ResizableLayout sidebar={<SidebarWrapper />}>
      {children}
    </ResizableLayout>
  );
}
