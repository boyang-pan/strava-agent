"use client";

import { createContext, useContext, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import type { PanelImperativeHandle } from "react-resizable-panels";

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
  const panelRef = useRef<PanelImperativeHandle>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  function toggle() {
    if (isCollapsed) {
      panelRef.current?.expand();
    } else {
      panelRef.current?.collapse();
    }
  }

  return (
    <SidebarContext value={{ isCollapsed, toggle }}>
      <Group orientation="horizontal" className="h-full w-full">
        <Panel
          panelRef={panelRef}
          defaultSize="20%"
          minSize="15%"
          maxSize="35%"
          collapsible
          collapsedSize="0%"
          onResize={(size) => setIsCollapsed(size.asPercentage === 0)}
        >
          {sidebar}
        </Panel>

        <Separator className="group relative w-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors cursor-col-resize" />

        <Panel>
          <div className="h-full overflow-hidden">
            {children}
          </div>
        </Panel>
      </Group>
    </SidebarContext>
  );
}
