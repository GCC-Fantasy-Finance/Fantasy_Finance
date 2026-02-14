import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import { X, Send, Pin, History, ArrowLeft, Plus, Stars } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "./button";
import { Input } from "./input";
import { useAuth } from "@/context/AuthContext";
import { useChatbot } from "@/context/ChatbotContext";
import {
  createConversation,
  addMessage,
  getUserConversations,
  getConversationMessages,
  callOpenAIStream,
  type ChatConversation,
  type ChatMessage,
} from "@/lib/chat";

interface ChatbotProps {
  disabled?: boolean;
  isPinned?: boolean;
  onPinnedChange?: (pinned: boolean) => void;
}

// type ChatbotState = "closed" | "small" | "expanded";
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
  const {
    chatbotState: state,
    setChatbotState: setState,
    setLastConversationId,
    initialMessage,
    setInitialMessage,
  } = useChatbot();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const chatbotRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const floatingMessagesRef = useRef<HTMLDivElement>(null);
  const pinnedMessagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastUserMessageRef = useRef<HTMLDivElement>(null);
  const lastAiMessageRef = useRef<HTMLDivElement>(null);
  const [spacerHeight, setSpacerHeight] = useState(0);
  const [savedScrollRatio, setSavedScrollRatio] = useState<number | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const prevStreamingRef = useRef(false);
  const { user } = useAuth();

  useEffect(() => {
    if (conversationId) {
      setLastConversationId(conversationId);
    }
  }, [conversationId, setLastConversationId]);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (mouseMoveEvent: MouseEvent) => {
      if (isResizing && sidebarRef.current) {
        const sidebarRect = sidebarRef.current.getBoundingClientRect();
        // Sidebar is on the right, so width increases as we move mouse left.
        // We use the right edge of the window (or rect) as the anchor.
        // newWidth = RightEdge - MouseX
        const newWidth = sidebarRect.right - mouseMoveEvent.clientX;
        setSidebarWidth(newWidth);
      }
    },
    [isResizing],
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
    }

    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  // Handle dynamic spacer calculation
  useLayoutEffect(() => {
    const calculateSpacer = () => {
      const container =
        floatingMessagesRef.current || pinnedMessagesRef.current;
      const lastUser = lastUserMessageRef.current;
      const lastAi = lastAiMessageRef.current; // This will track the growing AI message

      // If we don't have the elements, no spacer needed
      if (!container || !lastUser) {
        setSpacerHeight(0);
        return;
      }

      // Calculate heights
      const containerHeight = container.clientHeight;
      const userHeight = lastUser.offsetHeight;
      const aiHeight = lastAi?.offsetHeight || 0;

      // Calculate the gap (space-y-4 is 1rem/16px)
      // We want to account for the gap between the user message and the AI message
      const gap = 16;

      // Calculate occupied height: User Msg + Gap + AI Msg + (potential bottom padding/gap)
      const contentHeight = userHeight + (lastAi ? gap : 0) + aiHeight;

      // The spacer should fill the rest of the screen so the User message is at top
      // spacer = container - content
      // We add a buffer to ensure there's enough scroll space to honor the scroll-margin
      const neededSpacer = Math.max(0, containerHeight - contentHeight + 40);

      setSpacerHeight(neededSpacer);
    };

    calculateSpacer();

    const resizeObserver = new ResizeObserver(() => {
      calculateSpacer();
    });

    if (floatingMessagesRef.current)
      resizeObserver.observe(floatingMessagesRef.current);
    if (pinnedMessagesRef.current)
      resizeObserver.observe(pinnedMessagesRef.current);
    if (lastAiMessageRef.current)
      resizeObserver.observe(lastAiMessageRef.current);

    return () => resizeObserver.disconnect();
  }, [messages, state, isPinned, viewMode]);

  // Scroll to user message when streaming starts
  useEffect(() => {
    if (isStreaming && lastUserMessageRef.current) {
      lastUserMessageRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [isStreaming]);

  // Auto-scroll to bottom when messages change (but not during or after streaming)
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = isStreaming;

    // Only auto-scroll if we're not streaming and we didn't just finish streaming
    // And only if we are not in the "hold at top" mode which implies...
    // Actually, if we just sent a message, isStreaming handles it.
    // If we load history, maybe we want to scroll to bottom?
    if (!isStreaming && !wasStreaming && messages.length > 0) {
      // If it's a new message just added by user (but before streaming starts), handled by scrollIntoView in handleSend?
      // Let's rely on standard behavior for history load
      if (viewMode === "history") {
        // Do nothing or scroll top? History usually scroll top
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [messages, isStreaming, viewMode]);

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

  // Auto-focus input when small window opens
  useEffect(() => {
    if (state === "small" && viewMode === "chat") {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [state, viewMode]);

  // Auto-send initial message when set from stock details modal
  useEffect(() => {
    if (initialMessage && state === "expanded" && !isStreaming) {
      // Use a small delay to ensure the message state is updated
      const timer = setTimeout(() => {
        handleSendWithMessage(initialMessage);
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [initialMessage, state]);

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

  const handleSendWithMessage = useCallback(async (messageText: string) => {
    if (!messageText.trim() || !user) return;

    const trimmedMessage = messageText.trim();

    // Add user message to UI immediately
    const userMessage: Message = {
      id: Date.now().toString(),
      text: trimmedMessage,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setState("expanded");

    // Clear the initial message after sending it
    if (initialMessage) {
      setInitialMessage(null);
    }

    try {
      // Create conversation if this is the first message
      let currentConversationId = conversationId;
      if (!currentConversationId) {
        const { data: conversation, error: convError } =
          await createConversation(
            user.id,
            trimmedMessage.substring(0, 50), // Use first 50 chars as title
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
        trimmedMessage,
        false,
      );

      if (userMsgError) {
        console.error("Failed to save user message:", userMsgError);
      }

      // Create placeholder AI message for streaming
      const aiMessageId = (Date.now() + 1).toString();
      const aiMessage: Message = {
        id: aiMessageId,
        text: "",
        sender: "ai",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);

      // Prepare messages for OpenAI context
      // Convert existing messages to OpenAI format
      const historyMessages = messages.map((msg) => ({
        role: msg.sender === "ai" ? "assistant" : "user",
        content: msg.text,
      }));

      // Define your system prompt / instructions here
      const systemPrompt = {
        role: "system",
        content: `You are a knowledgeable assistant for a stock trading game. You enjoy helping users learn about the stock market and make informed decisions on stock trading.
        Current Date: ${new Date().toLocaleDateString()}
        
        Rules:
        1. If you don't know or can't get the answer, say you don't know.
        2. Be concise, explain things simply.`,
      };

      // Add the new user message AND the system prompt at the start
      const apiMessages = [
        systemPrompt,
        ...historyMessages,
        { role: "user", content: trimmedMessage },
      ];

      // Call OpenAI with streaming
      setLoadingAI(true);
      setIsStreaming(true);
      let fullResponse = "";
      let hasReceivedChunk = false;

      const { error: streamError } = await callOpenAIStream(
        apiMessages,
        (chunk) => {
          fullResponse += chunk;
          // Stop loading indicator and scroll to response on first chunk
          if (!hasReceivedChunk) {
            hasReceivedChunk = true;
            setLoadingAI(false);
            // Scroll to show the user message and start of AI response
            setTimeout(() => {
              lastUserMessageRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }, 0);
          }
          // Update the AI message with the accumulated response
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId ? { ...msg, text: fullResponse } : msg,
            ),
          );
        },
      );

      setLoadingAI(false);
      setIsStreaming(false);

      if (streamError) {
        console.error("Failed to get AI response:", streamError);
        // Show error message to user
        const errorMessage: Message = {
          id: (Date.now() + 2).toString(),
          text: "Sorry, I encountered an error. Please try again.",
          sender: "ai",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        return;
      }

      // Save AI message to database
      const { error: aiMsgError } = await addMessage(
        currentConversationId,
        fullResponse,
        true,
      );

      if (aiMsgError) {
        console.error("Failed to save AI message:", aiMsgError);
      }
    } catch (error) {
      console.error("Error handling message:", error);
      setLoadingAI(false);
    }
  }, [user, conversationId, messages, initialMessage, setInitialMessage]);

  const handleSend = async () => {
    if (!message.trim() || !user) return;

    const messageText = message.trim();
    setMessage("");
    await handleSendWithMessage(messageText);
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
      conversation.conversation_id,
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
      <div className="flex items-center gap-1 ">
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
              variant="outline"
              size="sm"
              onClick={handleShowHistory}
              className={`h-8 ${state === "small" ? "px-2" : "w-8 p-0"}`}
            >
              <History className="h-4 w-4" />
              {state === "small" && <span className="text-xs">History</span>}
            </Button>
            {conversationId && (
              <Button
                variant="outline"
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
                variant="outline"
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
            variant="outline"
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
            variant="outline"
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
          ref={inputRef}
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
          disabled={!message.trim() || loadingAI}
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

    // Identify last user and AI messages for refs
    let lastUserIdx = -1;
    let lastAiIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender === "user" && lastUserIdx === -1) lastUserIdx = i;
      if (messages[i].sender === "ai" && lastAiIdx === -1) lastAiIdx = i;
      if (lastUserIdx !== -1 && lastAiIdx !== -1) break;
    }

    return (
      <div className="space-y-4">
        {messages.map((msg, index) => {
          const isLastUser = index === lastUserIdx;
          const isLastAi = index === lastAiIdx;

          return (
            <div
              key={msg.id}
              ref={
                isLastUser
                  ? lastUserMessageRef
                  : isLastAi
                    ? lastAiMessageRef
                    : null
              }
              className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"} scroll-mt-4`}
            >
              {msg.sender === "user" ? (
                <div className="bg-chat-user-bubble text-black rounded-2xl px-4 py-2 max-w-[80%]">
                  <p className="text-sm">{msg.text}</p>
                </div>
              ) : (
                <div className="text-sm text-gray-800">
                  <ReactMarkdown
                    components={{
                      p: (props) => <p className="mb-2" {...props} />,
                      ul: (props) => (
                        <ul className="list-disc list-inside mb-2" {...props} />
                      ),
                      ol: (props) => (
                        <ol
                          className="list-decimal list-inside mb-2"
                          {...props}
                        />
                      ),
                      li: (props) => <li className="mb-1" {...props} />,
                      code: (props) => (
                        <code
                          className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono"
                          {...props}
                        />
                      ),
                      pre: (props) => (
                        <pre
                          className="bg-gray-100 p-2 rounded overflow-x-auto mb-2"
                          {...props}
                        />
                      ),
                      blockquote: (props) => (
                        <blockquote
                          className="border-l-4 border-gray-300 pl-3 italic mb-2"
                          {...props}
                        />
                      ),
                      strong: (props) => (
                        <strong className="font-semibold" {...props} />
                      ),
                      em: (props) => <em className="italic" {...props} />,
                      h1: (props) => (
                        <h1 className="text-lg font-bold mb-2" {...props} />
                      ),
                      h2: (props) => (
                        <h2 className="text-base font-bold mb-2" {...props} />
                      ),
                      h3: (props) => (
                        <h3 className="text-sm font-bold mb-2" {...props} />
                      ),
                    }}
                  >
                    {msg.text}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          );
        })}
        {loadingAI && (
          <div className="flex justify-start">
            <div className="text-sm text-gray-500">
              <span className="animate-pulse">AI is thinking...</span>
            </div>
          </div>
        )}
        <div
          style={{
            height: spacerHeight,
            minHeight: 0,
            transition: "height 0.1s ease-out",
          }}
        />
        <div ref={messagesEndRef} />
      </div>
    );
  };

  // Pinned mode - full height sidebar on the right
  if (isPinned) {
    return (
      <div
        ref={sidebarRef}
        className={`relative h-full bg-white border-l border-gray-300 flex flex-col z-[60] ${
          sidebarWidth ? "" : "w-64 lg:w-80 xl:w-[400px]"
        } min-w-64 lg:min-w-80 xl:min-w-[400px] max-w-[90vw] md:max-w-[600px] xl:max-w-[800px]`}
        style={sidebarWidth ? { width: sidebarWidth } : undefined}
      >
        {/* Resize Handle */}
        <div
          className="absolute -left-px top-0 bottom-0 w-4 cursor-col-resize z-50 -translate-x-1/2 flex justify-center group"
          onMouseDown={startResizing}
        >
          {/* Visual indicator on hover */}
          <div className="w-px h-full bg-transparent group-hover:bg-gray-400 transition-colors" />
        </div>
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
    <div ref={chatbotRef} className="fixed bottom-6 right-6 z-[60]">
      {/* Floating Window - Small or Expanded */}
      {state !== "closed" && (
        <div
          className={`absolute bottom-18 right-0 bg-white rounded-lg shadow-2xl border border-gray-300 transition-all duration-300 ${
            state === "small" ? "w-80 h-32" : "w-96 flex flex-col"
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
            >
              {viewMode === "history" ? renderHistory() : renderMessages()}
            </div>
          )}

          {/* Input area - only show in chat mode */}
          {viewMode === "chat" &&
            renderInput(
              `${state === "expanded" ? "border-t" : ""} p-4 border-gray-300 bg-white rounded-b-lg`,
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
