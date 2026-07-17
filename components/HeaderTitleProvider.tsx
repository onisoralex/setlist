"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type HeaderTitleContextValue = {
  title: ReactNode;
  setTitle: (node: ReactNode) => void;
};

const HeaderTitleContext = createContext<HeaderTitleContextValue | null>(null);

// Lives above <nav> and <main> in app/layout.tsx so both the nav (reader) and the currently
// routed page (writer) share one context instance -- app/layout.tsx itself is a Server
// Component and can't hold this state directly.
const HeaderTitleProvider = ({ children }: { children: ReactNode }) => {
  const [title, setTitle] = useState<ReactNode>(null);
  const value = useMemo(() => ({ title, setTitle }), [title]);
  return <HeaderTitleContext.Provider value={value}>{children}</HeaderTitleContext.Provider>;
};

const useHeaderTitleContext = (): HeaderTitleContextValue => {
  const ctx = useContext(HeaderTitleContext);
  if (!ctx) throw new Error("useHeaderTitleContext must be used within HeaderTitleProvider");
  return ctx;
};

// Read-only side, used by components/HeaderTitle.tsx (the nav's title slot) -- not exported
// for pages to call, they use useSetHeaderTitle below instead.
export const useHeaderTitle = (): ReactNode => useHeaderTitleContext().title;

// Called by whichever page is currently active to supply the nav's title-slot content.
// Accepts a ReactNode (not just a string) so a future page can render mixed font sizes -- e.g.
// a date at the header's title size next to smaller status text -- in this same slot.
export const useSetHeaderTitle = (node: ReactNode): void => {
  const { setTitle } = useHeaderTitleContext();
  useEffect(() => {
    setTitle(node);
    return () => setTitle(null);
  }, [setTitle, node]);
};

export default HeaderTitleProvider;
