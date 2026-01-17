import { useEffect } from "react";
import { useChatbot } from "../context/ChatbotContext";

/**
 * Hook to disable the chatbot on specific pages
 * Call this hook in any page component where you want to hide the chatbot
 *
 * @example
 * ```tsx
 * function MyPage() {
 *   useChatbotDisabled();
 *   return <div>My Page Content</div>;
 * }
 * ```
 */
export function useChatbotDisabled() {
  const { setIsDisabled } = useChatbot();

  useEffect(() => {
    setIsDisabled(true);
    return () => setIsDisabled(false);
  }, [setIsDisabled]);
}
