import { DEFAULT_OLLAMA_BASE_URL, normalizeOllamaBaseUrl } from "@/lib/providers";

export const runtime = "nodejs";

type OllamaTagsResponse = {
  models?: Array<{
    name: string;
    size?: number;
    modified_at?: string;
  }>;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const baseUrl = normalizeOllamaBaseUrl(
    searchParams.get("baseUrl") ||
      process.env.OLLAMA_BASE_URL ||
      DEFAULT_OLLAMA_BASE_URL,
  );

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed.";
    return new Response(
      `Could not reach Ollama at ${baseUrl}. Is it running? ${message}`,
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return new Response(
      detail || `Ollama returned ${upstream.status}.`,
      { status: upstream.status },
    );
  }

  let data: OllamaTagsResponse;
  try {
    data = (await upstream.json()) as OllamaTagsResponse;
  } catch {
    return new Response("Invalid response from Ollama.", { status: 502 });
  }

  const models = (data.models ?? [])
    .map((model) => ({
      name: model.name,
      size: model.size,
      modifiedAt: model.modified_at,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return Response.json({ models, baseUrl });
}
