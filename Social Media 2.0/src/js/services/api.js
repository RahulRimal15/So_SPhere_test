const DEFAULT_TIMEOUT_MS = 15000;

function createAbortSignal(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout)
  };
}

function getApiBasePath() {
  return window.SOCIALSPHERE_CONFIG?.apiBasePath || "/api";
}

export async function postJson(path, payload, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const { signal, clear } = createAbortSignal(timeoutMs);

  try {
    const response = await fetch(`${getApiBasePath()}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(body.error || `Request failed with status ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return body;
  } finally {
    clear();
  }
}

export async function callAiEndpoint(endpoint, payload, fallback) {
  const enabled = window.SOCIALSPHERE_CONFIG?.enableAI !== false;
  if (!enabled) {
    return {
      result: fallback,
      fallbackUsed: true,
      message: "AI feature is disabled by configuration."
    };
  }

  try {
    const response = await postJson(`/ai/${endpoint}`, payload, 16000);
    return {
      result: response.result,
      fallbackUsed: Boolean(response.fallbackUsed),
      requestId: response.requestId
    };
  } catch (error) {
    return {
      result: fallback,
      fallbackUsed: true,
      error
    };
  }
}
