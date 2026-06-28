export type ChatRole = "system" | "user" | "assistant";

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: ChatRole;
  content: string | ChatContentPart[];
  reasoning?: string;
};

export type ReasoningDetail = {
  type?: string;
  text?: string;
  summary?: string;
};

export type ChatCompletionDelta = {
  content?: string | null;
  reasoning?: string;
  reasoning_content?: string;
  thinking?: string;
  reasoning_details?: ReasoningDetail[];
};

export type ChatCompletionChunk = {
  choices: Array<{
    delta?: ChatCompletionDelta;
    finish_reason?: string | null;
  }>;
};

export type ChatCompletionResponse = {
  choices: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

export type ChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  reasoning?: unknown;
  include_reasoning?: boolean;
  think?: boolean;
};

export type AiClientOptions = {
  apiKey: string;
  baseURL: string;
  headers?: Record<string, string>;
};

export type AiRequestOptions = {
  signal?: AbortSignal;
};

export function createAiClient({ apiKey, baseURL, headers = {} }: AiClientOptions) {
  const root = baseURL.replace(/\/$/, "");

  async function request<T>(
    body: ChatCompletionRequest,
    options: AiRequestOptions = {},
  ): Promise<T> {
    const response = await fetch(`${root}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...headers,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `Upstream request failed (${response.status}).`);
    }

    return response.json() as Promise<T>;
  }

  return {
    async complete(
      body: Omit<ChatCompletionRequest, "stream">,
      options: AiRequestOptions = {},
    ): Promise<ChatCompletionResponse> {
      return request<ChatCompletionResponse>({ ...body, stream: false }, options);
    },

    async *stream(
      body: Omit<ChatCompletionRequest, "stream">,
      options: AiRequestOptions = {},
    ): AsyncGenerator<ChatCompletionChunk> {
      const response = await fetch(`${root}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...headers,
        },
        body: JSON.stringify({ ...body, stream: true }),
        signal: options.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `Upstream request failed (${response.status}).`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Upstream response has no body.");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          if (options.signal?.aborted) {
            await reader.cancel().catch(() => {});
            break;
          }

          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data:")) continue;

            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") return;

            try {
              yield JSON.parse(payload) as ChatCompletionChunk;
            } catch {
              // Skip malformed SSE chunks.
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
  };
}
