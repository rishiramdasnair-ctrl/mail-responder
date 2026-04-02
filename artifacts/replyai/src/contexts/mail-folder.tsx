import { createContext, useContext, useState } from "react";

export type FolderId = "INBOX" | "STARRED" | "SENT" | "DRAFTS" | "SPAM" | "TRASH";

interface MailFolderContextValue {
  activeLabel: FolderId;
  setActiveLabel: (label: FolderId) => void;
}

const MailFolderContext = createContext<MailFolderContextValue>({
  activeLabel: "INBOX",
  setActiveLabel: () => {},
});

export function MailFolderProvider({ children }: { children: React.ReactNode }) {
  const [activeLabel, setActiveLabel] = useState<FolderId>("INBOX");
  return (
    <MailFolderContext.Provider value={{ activeLabel, setActiveLabel }}>
      {children}
    </MailFolderContext.Provider>
  );
}

export function useMailFolder() {
  return useContext(MailFolderContext);
}
