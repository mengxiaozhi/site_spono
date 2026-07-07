import fs from "node:fs";
import path from "node:path";

const DEFAULT_GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_GEMINI_TIMEOUT_MS = 12000;
const MAX_HTML_BYTES = 180 * 1024;
const MAX_CSS_BYTES = 120 * 1024;

const generatedSiteSchema = {
  type: "object",
  properties: {
    siteName: {
      type: "string",
      description: "A concise website name in Traditional Chinese or the user's language."
    },
    summary: {
      type: "string",
      description: "A one sentence summary of the generated website."
    },
    files: {
      type: "object",
      properties: {
        indexHtml: {
          type: "string",
          description: "Complete static HTML for index.html. It must link assets/style.css and contain no JavaScript."
        },
        css: {
          type: "string",
          description: "Complete CSS for assets/style.css. It must be self-contained and contain no imports."
        }
      },
      required: ["indexHtml", "css"]
    }
  },
  required: ["siteName", "summary", "files"]
};

function createGeneratorError(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}

function limitText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function buildPrompt(input) {
  return [
    "請依照使用者提供的資料，生成一個可直接部署的靜態網站。",
    "",
    "輸出要求：",
    "- 只輸出符合 JSON schema 的資料。",
    "- indexHtml 必須是完整 HTML 文件，包含 <!doctype html>、html/head/body。",
    "- indexHtml 必須用 <link rel=\"stylesheet\" href=\"assets/style.css\"> 連到 CSS。",
    "- 不可以使用 JavaScript、script tag、inline event handler、form、iframe、object、embed、base tag。",
    "- 不要引用外部 CSS、字型、圖片或 CDN；用 CSS 色塊、排版、漸層與卡片做視覺。",
    "- CSS 需包含桌面與手機響應式版型。",
    "- 文案使用繁體中文，除非使用者明確要求其他語言。",
    "- 網站需包含清楚的首屏、價值主張、服務/特色、流程或方案、信任訊號、CTA、聯絡區塊。",
    "",
    "網站名稱：",
    limitText(input.name, 120),
    "",
    "目標受眾：",
    limitText(input.audience, 500) || "一般訪客",
    "",
    "網站需求：",
    limitText(input.brief, 3000),
    "",
    "希望風格：",
    limitText(input.style, 700) || "乾淨、專業、易讀、具有現代產品感",
    "",
    "希望區塊：",
    limitText(input.sections, 1000) || "首屏、特色、流程、案例/證明、聯絡 CTA",
    "",
    "聯絡或 CTA 資訊：",
    limitText(input.contact, 700) || "引導訪客聯絡或預約諮詢"
  ].join("\n");
}

function extractInteractionText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const steps = Array.isArray(payload?.steps) ? [...payload.steps].reverse() : [];
  for (const step of steps) {
    const content = Array.isArray(step?.content) ? [...step.content].reverse() : [];
    for (const part of content) {
      if (typeof part?.text === "string" && part.text.trim()) {
        return part.text;
      }
    }
  }

  const candidateText = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter(Boolean)
    .join("");
  if (candidateText) {
    return candidateText;
  }

  throw createGeneratorError("Gemini 沒有回傳可解析的網站內容");
}

function parseJsonText(text) {
  const trimmed = String(text || "").trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(withoutFence);
  } catch {
    throw createGeneratorError("Gemini 回傳格式不是有效 JSON");
  }
}

function normalizeGeneratedSite(value) {
  const siteName = limitText(value?.siteName, 120);
  const summary = limitText(value?.summary, 500);
  const indexHtml = String(value?.files?.indexHtml || "").trim();
  const css = String(value?.files?.css || "").trim();

  if (!siteName || !summary || !indexHtml || !css) {
    throw createGeneratorError("Gemini 回傳缺少必要網站檔案");
  }
  if (Buffer.byteLength(indexHtml, "utf8") > MAX_HTML_BYTES || Buffer.byteLength(css, "utf8") > MAX_CSS_BYTES) {
    throw createGeneratorError("Gemini 生成內容超過系統限制");
  }

  return {
    siteName,
    summary,
    files: {
      indexHtml,
      css
    }
  };
}

function assertNoUnsafeMarkup(html, css) {
  const unsafeHtmlPatterns = [
    /<script\b/i,
    /\son[a-z]+\s*=/i,
    /javascript\s*:/i,
    /<iframe\b/i,
    /<object\b/i,
    /<embed\b/i,
    /<form\b/i,
    /<input\b/i,
    /<textarea\b/i,
    /<button\b/i,
    /<base\b/i,
    /<meta\b[^>]*http-equiv\s*=/i
  ];
  const unsafeCssPatterns = [
    /@import\b/i,
    /expression\s*\(/i,
    /url\s*\(\s*["']?\s*javascript\s*:/i
  ];
  const linkTags = html.match(/<link\b[^>]*>/gi) || [];

  if (unsafeHtmlPatterns.some((pattern) => pattern.test(html)) || unsafeCssPatterns.some((pattern) => pattern.test(css))) {
    throw createGeneratorError("Gemini 生成內容包含不允許的可執行或嵌入式標記");
  }

  for (const tag of linkTags) {
    const isStylesheet = /\brel\s*=\s*["']?stylesheet["']?/i.test(tag);
    const isLocalCss = /\bhref\s*=\s*["']assets\/style\.css["']/i.test(tag);
    if (!isStylesheet || !isLocalCss) {
      throw createGeneratorError("Gemini 生成內容引用了不允許的外部資源");
    }
  }
}

function ensureStylesheetLink(html) {
  if (/assets\/style\.css/i.test(html)) {
    return html;
  }
  const link = '<link rel="stylesheet" href="assets/style.css">';
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `  ${link}\n</head>`);
  }
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${link}
</head>
<body>
${html}
</body>
</html>`;
}

export async function generateSiteWithGemini({ config, input, fetchImpl = fetch }) {
  if (!config.geminiApiKey) {
    throw createGeneratorError("Gemini API key 尚未設定", 503);
  }

  const controller = new AbortController();
  const timeoutMs = config.geminiTimeoutMs || DEFAULT_GEMINI_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;

  try {
    response = await fetchImpl(config.geminiEndpoint || DEFAULT_GEMINI_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": config.geminiApiKey
      },
      body: JSON.stringify({
        model: config.geminiModel,
        store: false,
        system_instruction: "你是 Site Spono 的網站生成器。請生成安全、可部署、靜態、無 JavaScript 的 HTML/CSS 網站。",
        input: buildPrompt(input),
        generation_config: {
          temperature: 0.7,
          thinking_level: config.geminiThinkingLevel || "minimal"
        },
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: generatedSiteSchema
        }
      })
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createGeneratorError("Gemini 生成逾時，請縮短需求或稍後再試", 504);
    }
    throw createGeneratorError("Gemini API 連線失敗，請稍後再試");
  } finally {
    clearTimeout(timeout);
  }

  const payloadText = await response.text();
  const payload = payloadText ? parseJsonText(payloadText) : {};

  if (!response.ok) {
    throw createGeneratorError(payload?.error?.message || "Gemini API 呼叫失敗");
  }

  return normalizeGeneratedSite(parseJsonText(extractInteractionText(payload)));
}

export async function writeGeneratedSiteFiles(generatedSite, destination) {
  const indexHtml = ensureStylesheetLink(generatedSite.files.indexHtml);
  const css = generatedSite.files.css;
  assertNoUnsafeMarkup(indexHtml, css);

  await fs.promises.rm(destination, { recursive: true, force: true });
  await fs.promises.mkdir(path.join(destination, "assets"), { recursive: true });
  await fs.promises.writeFile(path.join(destination, "index.html"), indexHtml, "utf8");
  await fs.promises.writeFile(path.join(destination, "assets", "style.css"), css, "utf8");

  return {
    fileCount: 2,
    totalBytes: Buffer.byteLength(indexHtml, "utf8") + Buffer.byteLength(css, "utf8")
  };
}
