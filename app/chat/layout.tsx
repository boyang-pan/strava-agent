import { SidebarWrapper } from "@/components/layout/sidebar-wrapper";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full">
      <div className="w-60 shrink-0">
        <SidebarWrapper />
      </div>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
