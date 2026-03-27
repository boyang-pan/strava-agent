"use client";

import { createContext, useContext, useState } from "react";

interface SidebarContextValue {
  isCollapsed: boolean;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  return useContext(SidebarContext);
}

interface ResizableLayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export function ResizableLayout({ sidebar, children }: ResizableLayoutProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  function toggle() {
    setIsCollapsed((c) => !c);
  }

  return (
    <SidebarContext value={{ isCollapsed, toggle }}>
      <div className="flex h-full">
        {/* Sidebar — fixed width, animate in/out */}
        <div
          className={`shrink-0 transition-all duration-200 overflow-hidden ${
            isCollapsed ? "w-0" : "w-60"
          }`}
        >
          {sidebar}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {children}
        </div>
      </div>
    </SidebarContext>
  );
}
