const GEMINI_INTERACTIONS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "iad1";

function jsonError(error: string, status: number) {
  return Response.json(
    { error },
    {
      status,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

export async function POST(request: Request) {
  const expectedToken = process.env.GEMINI_PROXY_TOKEN;
  if (!expectedToken) {
    return jsonError("Gemini proxy token is not configured", 503);
  }

  if (request.headers.get("authorization") !== `Bearer ${expectedToken}`) {
    return jsonError("Unauthorized", 401);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonError("Gemini API key is not configured", 503);
  }

  let bodyText = "";
  try {
    bodyText = await request.text();
    JSON.parse(bodyText);
  } catch {
    return jsonError("Invalid JSON payload", 400);
  }

  try {
    const upstream = await fetch(GEMINI_INTERACTIONS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: bodyText,
      cache: "no-store"
    });
    const responseBody = await upstream.text();

    return new Response(responseBody, {
      status: upstream.status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": upstream.headers.get("content-type") || "application/json"
      }
    });
  } catch {
    return jsonError("Gemini proxy request failed", 502);
  }
}
