import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

interface ChatbotContextType {
  isPinned: boolean;
  setIsPinned: (pinned: boolean) => void;
  isDisabled: boolean;
  setIsDisabled: (disabled: boolean) => void;
}

const ChatbotContext = createContext<ChatbotContextType | undefined>(undefined);

export function ChatbotProvider({ children }: { children: ReactNode }) {
  const [isPinned, setIsPinned] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);

  return (
    <ChatbotContext.Provider
      value={{
        isPinned,
        setIsPinned,
        isDisabled,
        setIsDisabled,
      }}
    >
      {children}
    </ChatbotContext.Provider>
  );
}

export function useChatbot() {
  const context = useContext(ChatbotContext);
  if (context === undefined) {
    throw new Error("useChatbot must be used within a ChatbotProvider");
  }
  return context;
}
