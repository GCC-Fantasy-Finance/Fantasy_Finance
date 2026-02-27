import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

interface ChatbotContextType {
  isPinned: boolean;
  setIsPinned: (pinned: boolean) => void;
  isDisabled: boolean;
  setIsDisabled: (disabled: boolean) => void;
  chatbotState: "closed" | "floating";
  setChatbotState: (state: "closed" | "floating") => void;
  lastConversationId: number | null;
  setLastConversationId: (id: number | null) => void;
  resumeRequested: boolean;
  setResumeRequested: (requested: boolean) => void;
  initialMessage: string | null;
  setInitialMessage: (message: string | null) => void;
}

const ChatbotContext = createContext<ChatbotContextType | undefined>(undefined);

export function ChatbotProvider({ children }: { children: ReactNode }) {
  const [isPinned, setIsPinned] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);
  const [chatbotState, setChatbotState] = useState<"closed" | "floating">(
    "closed",
  );
  const [lastConversationId, setLastConversationId] = useState<number | null>(
    null,
  );
  const [resumeRequested, setResumeRequested] = useState(false);
  const [initialMessage, setInitialMessage] = useState<string | null>(null);

  return (
    <ChatbotContext.Provider
      value={{
        isPinned,
        setIsPinned,
        isDisabled,
        setIsDisabled,
        chatbotState,
        setChatbotState,
        lastConversationId,
        setLastConversationId,
        resumeRequested,
        setResumeRequested,
        initialMessage,
        setInitialMessage,
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
