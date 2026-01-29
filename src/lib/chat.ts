import { supabase } from "./supabase";

export interface ChatConversation {
  conversation_id: number;
  created_at: string;
  title: string;
  user_id: string;
}

export interface ChatMessage {
  message_id: number;
  created_at: string;
  is_ai_message: boolean;
  message_text: string;
  conversation_id: number;
}

/**
 * Create a new chat conversation
 */
export async function createConversation(
  userId: string,
  title: string = "New Conversation",
): Promise<{ data: ChatConversation | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from("Chat Conversations")
      .insert({
        user_id: userId,
        title: title,
      })
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error("Error creating conversation:", error);
    return { data: null, error: error as Error };
  }
}

/**
 * Add a message to a conversation
 */
export async function addMessage(
  conversationId: number,
  messageText: string,
  isAiMessage: boolean,
): Promise<{ data: ChatMessage | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from("Chat Messages")
      .insert({
        conversation_id: conversationId,
        message_text: messageText,
        is_ai_message: isAiMessage,
      })
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error("Error adding message:", error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get all messages for a conversation
 */
export async function getConversationMessages(
  conversationId: number,
): Promise<{ data: ChatMessage[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from("Chat Messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error("Error fetching messages:", error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get all conversations for a user
 */
export async function getUserConversations(
  userId: string,
): Promise<{ data: ChatConversation[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from("Chat Conversations")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return { data: null, error: error as Error };
  }
}

/**
 * Update conversation title
 */
export async function updateConversationTitle(
  conversationId: number,
  title: string,
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from("Chat Conversations")
      .update({ title })
      .eq("conversation_id", conversationId);

    if (error) throw error;

    return { error: null };
  } catch (error) {
    console.error("Error updating conversation title:", error);
    return { error: error as Error };
  }
}

/**
 * Call OpenAI via Supabase edge function
 */
export async function callOpenAI(
  query: string,
): Promise<{ response: string | null; error: Error | null }> {
  try {
    console.log("Calling OpenAI edge function with query:", query);
    const { data, error } = await supabase.functions.invoke("openai-proxy", {
      body: { query },
    });
    console.log("Edge function response:", { data, error });

    if (error) throw error;

    // Extract the content from the OpenAI response
    const aiMessage = data?.choices?.[0]?.message?.content;

    if (!aiMessage) {
      throw new Error("No response content from OpenAI");
    }

    return { response: aiMessage, error: null };
  } catch (error) {
    console.error("Error calling OpenAI:", error);
    return { response: null, error: error as Error };
  }
}

/**
 * Call OpenAI via Supabase edge function with streaming
 * Calls the provided callback with chunks of text as they arrive
 */
export async function callOpenAIStream(
  messages: { role: string; content: string }[],
  onChunk: (chunk: string) => void,
): Promise<{ error: Error | null }> {
  try {
    console.log(
      "Calling OpenAI edge function with streaming messages:",
      messages,
    );

    // Get the session token for authentication
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token) {
      throw new Error("No authentication token available");
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openai-proxy`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages, stream: true }),
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Response body is not readable");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      // Process complete lines (SSE format)
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const jsonStr = line.slice(6);
            if (jsonStr === "[DONE]") {
              continue;
            }
            const json = JSON.parse(jsonStr);
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              onChunk(content);
            }
          } catch (e) {
            console.error("Error parsing SSE line:", e);
          }
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim().startsWith("data: ")) {
      try {
        const jsonStr = buffer.slice(6);
        if (jsonStr !== "[DONE]") {
          const json = JSON.parse(jsonStr);
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            onChunk(content);
          }
        }
      } catch (e) {
        console.error("Error parsing final SSE line:", e);
      }
    }

    return { error: null };
  } catch (error) {
    console.error("Error calling OpenAI stream:", error);
    return { error: error as Error };
  }
}
