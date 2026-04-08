import React, { createContext, useContext, useRef, useCallback } from "react";

type Listener = () => void;

interface InboxSheetContextValue {
  subscribeOpenAccountSheet: (listener: Listener) => () => void;
  emitOpenAccountSheet: () => void;
}

const InboxSheetContext = createContext<InboxSheetContextValue | null>(null);

export function InboxSheetProvider({ children }: { children: React.ReactNode }) {
  const listenersRef = useRef<Set<Listener>>(new Set());

  const subscribeOpenAccountSheet = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const emitOpenAccountSheet = useCallback(() => {
    listenersRef.current.forEach((l) => l());
  }, []);

  return (
    <InboxSheetContext.Provider value={{ subscribeOpenAccountSheet, emitOpenAccountSheet }}>
      {children}
    </InboxSheetContext.Provider>
  );
}

export function useInboxSheet() {
  const ctx = useContext(InboxSheetContext);
  if (!ctx) throw new Error("useInboxSheet must be used within InboxSheetProvider");
  return ctx;
}
