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
  title: string = "New Conversation"
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
  isAiMessage: boolean
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
  conversationId: number
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
  userId: string
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
  title: string
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
