// @ts-nocheck
// THIS IS THE CODE USED IN A SUPABASE EDGE FUNCTION.
// This code is not used here, this is soley for context.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Minimal server-side limiter (fixed window, per function instance).
const RATE_LIMIT_MAX_REQUESTS = 5;
const RATE_LIMIT_WINDOW_MS = 10_000; // 10 seconds
const requestTimestampsByKey = new Map<string, number[]>();

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;

    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
};

const getRateLimitKey = (req: Request): string => {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (token) {
    const payload = decodeJwtPayload(token);
    const userId = typeof payload?.sub === "string" ? payload.sub : null;
    if (userId) return `user:${userId}`;
  }

  const forwardedFor = req.headers.get("x-forwarded-for") || "";
  const ip = forwardedFor.split(",")[0].trim() || "anonymous";
  return `ip:${ip}`;
};

const checkRateLimit = (
  key: string,
): { limited: boolean; retryAfterSeconds: number } => {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  const existing = requestTimestampsByKey.get(key) || [];
  const recent = existing.filter((ts) => ts > windowStart);

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    const oldestInWindow = recent[0];
    const retryAfterMs = Math.max(
      0,
      oldestInWindow + RATE_LIMIT_WINDOW_MS - now,
    );
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    requestTimestampsByKey.set(key, recent);
    return { limited: true, retryAfterSeconds };
  }

  recent.push(now);
  requestTimestampsByKey.set(key, recent);
  return { limited: false, retryAfterSeconds: 0 };
};

serve(async (req) => {
  // 1. Handle CORS (Browser security check)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const limiterKey = getRateLimitKey(req);
  const rateLimitResult = checkRateLimit(limiterKey);
  if (rateLimitResult.limited) {
    return new Response(
      JSON.stringify({
        error:
          "Rate limit exceeded. Please wait before sending another request.",
      }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(rateLimitResult.retryAfterSeconds),
        },
      },
    );
  }

  try {
    // 2. Get the messages (or query) and stream flag from the request
    const { messages, query, stream = false } = await req.json();

    // Normalize input to messages array
    let chatMessages = messages;
    if (!chatMessages && query) {
      chatMessages = [{ role: "user", content: query }];
    }

    if (!chatMessages) {
      throw new Error("Missing messages or query in request body");
    }

    // 3. Call OpenAI
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const openAiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini-search-preview",
          messages: chatMessages,
          stream: stream,
        }),
      },
    );

    if (!stream) {
      // Non-streaming: return regular JSON response
      const data = await openAiResponse.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // Streaming: return SSE response
      const { readable, writable } = new TransformStream();

      const writer = writable.getWriter();
      const reader = openAiResponse.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let sseBuffer = "";

      const writeSseEvent = async (eventPayload: string) => {
        const lines = eventPayload.split(/\r?\n/);
        for (const line of lines) {
          await writer.write(encoder.encode(`data: ${line}\n`));
        }
        await writer.write(encoder.encode("\n"));
      };

      const forwardCompleteEvents = async (rawChunk: string) => {
        sseBuffer += rawChunk;

        const events = sseBuffer.split("\n\n");
        sseBuffer = events.pop() || "";

        for (const rawEvent of events) {
          const eventLines = rawEvent.split(/\r?\n/);
          const dataLines: string[] = [];

          for (const line of eventLines) {
            if (!line || line.startsWith(":")) {
              continue;
            }

            if (line.startsWith("data:")) {
              dataLines.push(line.slice(5).trimStart());
            }
          }

          if (dataLines.length > 0) {
            await writeSseEvent(dataLines.join("\n"));
          }
        }
      };

      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              await forwardCompleteEvents(decoder.decode());
              await writeSseEvent("[DONE]");
              await writer.close();
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            await forwardCompleteEvents(chunk);
          }
        } catch (error) {
          console.error("Stream error:", error);
          await writer.close();
        }
      })();

      return new Response(readable, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
