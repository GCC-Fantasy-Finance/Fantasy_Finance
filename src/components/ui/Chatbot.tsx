import { useState, useRef, useEffect } from "react";
import {
  X,
  MessageCircle,
  Send,
  Pin,
  History,
  ArrowLeft,
  Plus,
  Stars,
} from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import { useAuth } from "@/context/AuthContext";
import {
  createConversation,
  addMessage,
  getUserConversations,
  getConversationMessages,
  type ChatConversation,
  type ChatMessage,
} from "@/lib/chat";

interface ChatbotProps {
  disabled?: boolean;
  isPinned?: boolean;
  onPinnedChange?: (pinned: boolean) => void;
}

type ChatbotState = "closed" | "small" | "expanded";
type ViewMode = "chat" | "history";

interface Message {
  id: string;
  text: string;
  sender: "user" | "ai";
  timestamp: Date;
}

export default function Chatbot({
  disabled = false,
  isPinned = false,
  onPinnedChange,
}: ChatbotProps) {
  const [state, setState] = useState<ChatbotState>("closed");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const chatbotRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const floatingMessagesRef = useRef<HTMLDivElement>(null);
  const pinnedMessagesRef = useRef<HTMLDivElement>(null);
  const [savedScrollRatio, setSavedScrollRatio] = useState<number | null>(null);
  const { user } = useAuth();

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle click outside to close
  useEffect(() => {
    if (state === "closed" || isPinned) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        chatbotRef.current &&
        !chatbotRef.current.contains(event.target as Node)
      ) {
        setState("closed");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [state, isPinned]);

  const handleToggle = () => {
    if (state === "closed") {
      // Opening small window - start fresh
      setMessages([]);
      setConversationId(null);
      setViewMode("chat");
      setState("small");
    } else {
      // Closing window
      setState("closed");
    }
  };

  const handleSend = async () => {
    if (!message.trim() || !user) return;

    const messageText = message.trim();

    // Add user message to UI immediately
    const userMessage: Message = {
      id: Date.now().toString(),
      text: messageText,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setState("expanded");
    setMessage("");

    try {
      // Create conversation if this is the first message
      let currentConversationId = conversationId;
      if (!currentConversationId) {
        const { data: conversation, error: convError } =
          await createConversation(
            user.id,
            messageText.substring(0, 50) // Use first 50 chars as title
          );

        if (convError || !conversation) {
          console.error("Failed to create conversation:", convError);
          return;
        }

        currentConversationId = conversation.conversation_id;
        setConversationId(currentConversationId);
      }

      // Save user message to database
      const { error: userMsgError } = await addMessage(
        currentConversationId,
        messageText,
        false
      );

      if (userMsgError) {
        console.error("Failed to save user message:", userMsgError);
      }

      // Simulate AI response
      setTimeout(async () => {
        const aiResponseText =
          "ok asd asd as dasd as das das das das das dsdasdasdasd as  dasdasd asd asd as da das das dasdasd asd a sdas d";
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: aiResponseText,
          sender: "ai",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiMessage]);

        // Save AI message to database
        const { error: aiMsgError } = await addMessage(
          currentConversationId!,
          aiResponseText,
          true
        );

        if (aiMsgError) {
          console.error("Failed to save AI message:", aiMsgError);
        }
      }, 500);
    } catch (error) {
      console.error("Error handling message:", error);
    }
  };

  const handlePin = () => {
    // Capture current scroll position in floating expanded window as a ratio
    const el = floatingMessagesRef.current;
    if (el) {
      const maxScroll = el.scrollHeight - el.clientHeight;
      const ratio = maxScroll > 0 ? el.scrollTop / maxScroll : 0;
      setSavedScrollRatio(ratio);
    } else {
      setSavedScrollRatio(null);
    }

    onPinnedChange?.(true);
  };

  const handleClose = () => {
    if (isPinned) {
      onPinnedChange?.(false);
    }
    setState("closed");
    setViewMode("chat");
  };

  const handleShowHistory = async () => {
    if (!user) return;

    setViewMode("history");
    setState("expanded");
    setLoadingHistory(true);

    const { data, error } = await getUserConversations(user.id);

    if (error) {
      console.error("Failed to load conversations:", error);
    } else if (data) {
      setConversations(data);
    }

    setLoadingHistory(false);
  };

  const handleLoadConversation = async (conversation: ChatConversation) => {
    setLoadingHistory(true);

    const { data, error } = await getConversationMessages(
      conversation.conversation_id
    );

    if (error) {
      console.error("Failed to load messages:", error);
    } else if (data) {
      // Convert ChatMessage[] to Message[]
      const loadedMessages: Message[] = data.map((msg: ChatMessage) => ({
        id: msg.message_id.toString(),
        text: msg.message_text,
        sender: msg.is_ai_message ? "ai" : "user",
        timestamp: new Date(msg.created_at),
      }));

      setMessages(loadedMessages);
      setConversationId(conversation.conversation_id);
    }

    setLoadingHistory(false);
    setViewMode("chat");
  };

  const handleNewChat = () => {
    setMessages([]);
    setConversationId(null);
    setViewMode("chat");
  };

  // When switching to pinned mode, restore the saved scroll position
  useEffect(() => {
    if (isPinned && savedScrollRatio !== null && viewMode === "chat") {
      const el = pinnedMessagesRef.current;
      if (el) {
        const applyScroll = () => {
          const maxScroll = el.scrollHeight - el.clientHeight;
          const target = Math.round(savedScrollRatio * Math.max(0, maxScroll));
          el.scrollTop = target;
          // Clear saved ratio to avoid re-applying
          setSavedScrollRatio(null);
        };
        // Apply after layout to ensure measurements are correct
        requestAnimationFrame(applyScroll);
      }
    }
  }, [isPinned, savedScrollRatio, viewMode]);

  if (disabled) return null;

  // Render header (shared between pinned and floating modes)
  const renderHeader = (showPinButton = false) => (
    <div className="flex items-center justify-between h-14 px-4 border-b border-gray-300">
      <div className="flex items-center gap-1">
        <Button
          disabled={viewMode === "chat"}
          variant="ghost"
          size="sm"
          onClick={() => setViewMode("chat")}
          className="h-8 w-8 p-0 opacity-100!"
        >
          {viewMode === "history" ? (
            <ArrowLeft className="h-4 w-4 " />
          ) : (
            <Stars className="h-4 w-4 text-green-700" />
          )}
        </Button>

        <h2
          className={`text-md font-medium ${viewMode === "chat" && "text-green-700"}`}
        >
          {viewMode === "history" ? "Chat History" : "Assistant"}
        </h2>
      </div>
      <div className="flex gap-1">
        {viewMode === "chat" && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleShowHistory}
              className={`h-8 ${state === "small" ? "px-2" : "w-8 p-0"}`}
            >
              <History className="h-4 w-4" />
              {state === "small" && <span className="text-xs">History</span>}
            </Button>
            {conversationId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNewChat}
                className="h-8 px-2"
              >
                <span className="text-xs flex items-center">
                  <Plus className="inline-block h-4 w-4 mr-1" />
                  New
                </span>
              </Button>
            )}
            {showPinButton && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePin}
                className="h-8 w-8 p-0"
              >
                <Pin className="h-4 w-4" />
              </Button>
            )}
          </>
        )}
        {viewMode === "history" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewChat}
            className="h-8 px-2"
          >
            <span className="text-xs flex items-center">
              <Plus className="inline-block h-4 w-4 mr-1" />
              New
            </span>
          </Button>
        )}
        {state !== "small" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );

  // Render input area (shared between pinned and floating modes)
  const renderInput = (className = "") => (
    <div className={className}>
      <div className="flex gap-2 items-center h-9">
        <Input
          type="text"
          placeholder="Type your message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSend();
            }
          }}
          className="flex-1 h-9"
        />
        <Button
          onClick={handleSend}
          disabled={!message.trim()}
          className="w-9 h-9"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  // Render history list
  const renderHistory = () => {
    if (loadingHistory) {
      return <p className="text-gray-500 text-sm">Loading conversations...</p>;
    }

    if (conversations.length === 0) {
      return (
        <p className="text-gray-500 text-sm">No conversation history yet.</p>
      );
    }

    return (
      <div className="space-y-2 pr-2">
        {conversations.map((conv) => (
          <button
            key={conv.conversation_id}
            onClick={() => handleLoadConversation(conv)}
            className="w-full text-left p-3 rounded hover:bg-gray-100 transition-colors border border-gray-300 cursor-pointer"
          >
            <p className="text-sm font-medium text-gray-900 truncate">
              {conv.title}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {new Date(conv.created_at).toLocaleDateString()} at{" "}
              {new Date(conv.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </button>
        ))}
      </div>
    );
  };

  // Render messages
  const renderMessages = () => {
    if (messages.length === 0) {
      return <p className="text-gray-500 text-sm">Start a conversation...</p>;
    }

    return (
      <div className="space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.sender === "user" ? (
              <div className="bg-chat-user-bubble text-black rounded-2xl px-4 py-2 max-w-[80%]">
                <p className="text-sm">{msg.text}</p>
              </div>
            ) : (
              <div className="">
                <p className="text-sm text-gray-800">{msg.text}</p>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
    );
  };

  // Pinned mode - full height sidebar on the right
  if (isPinned) {
    return (
      <div className="h-full w-96 bg-white border-l border-gray-300 flex flex-col">
        {renderHeader()}

        {/* Messages area */}
        <div
          className="flex-1 overflow-auto p-4 pr-2 chatbot-scroll"
          ref={pinnedMessagesRef}
        >
          {viewMode === "history" ? renderHistory() : renderMessages()}
        </div>

        {/* Input area - only show in chat mode */}
        {viewMode === "chat" && renderInput("p-4 border-t border-gray-300")}
      </div>
    );
  }

  return (
    <div ref={chatbotRef} className="fixed bottom-6 right-6 z-50">
      {/* Floating Window - Small or Expanded */}
      {state !== "closed" && (
        <div
          className={`absolute bottom-18 right-0 bg-white rounded-lg shadow-2xl border border-gray-300 transition-all duration-300 ${
            state === "small" ? "w-80 h-32" : "w-96"
          }`}
          style={{
            height: state === "expanded" ? "calc(100vh - 120px)" : undefined,
          }}
        >
          {/* Window Header */}
          {renderHeader(state === "expanded")}

          {/* Messages area - only show in expanded state */}
          {state === "expanded" && (
            <div
              className="flex-1 overflow-auto p-4 pr-2 chatbot-scroll"
              ref={floatingMessagesRef}
              style={{
                height: "calc(100% - 140px)",
              }}
            >
              {viewMode === "history" ? renderHistory() : renderMessages()}
            </div>
          )}

          {/* Input area - only show in chat mode */}
          {viewMode === "chat" &&
            renderInput(
              `${state === "expanded" ? "absolute bottom-0 left-0 right-0 border-t" : ""} p-4 border-gray-300 bg-white rounded-b-lg`
            )}
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={handleToggle}
        className={`h-14 w-14 cursor-pointer rounded-full shadow-lg flex items-center justify-center transition-all duration-200 ${
          state === "closed"
            ? "bg-green-700 hover:bg-green-800"
            : "bg-green-700 hover:bg-green-800"
        }`}
      >
        {state === "closed" ? (
          <Stars className="h-6 w-6 text-white" />
        ) : (
          <X className="h-6 w-6 text-white" />
        )}
      </button>
    </div>
  );
}
