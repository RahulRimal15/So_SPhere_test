/* eslint-disable no-console */
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const geminiApiKey = defineSecret("GEMINI_API_KEY");

const DAILY_LIMITS = {
  polishCount: 20,
  ideaCount: 20,
  summaryCount: 20
};

const ENDPOINT_CONFIG = {
  "/ai/polish": {
    quotaField: "polishCount",
    fallback: "Your draft is clear and concise. Add one specific detail to make it stronger."
  },
  "/ai/idea": {
    quotaField: "ideaCount",
    fallback: "Share one challenge you solved today and one practical lesson learned."
  },
  "/ai/summarize": {
    quotaField: "summaryCount",
    fallback: "The feed is focused on practical project progress, iterative improvements, and collaborative problem solving."
  }
};

function sanitizeText(value, maxLength) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeFeedItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.slice(0, 10).map((item) => ({
    author: sanitizeText(item.author, 60),
    content: sanitizeText(item.content, 500)
  }));
}

function yyyymmdd(ts) {
  return ts.toISOString().slice(0, 10);
}

async function enforceDailyQuota(uid, quotaField) {
  const dateKey = yyyymmdd(new Date());
  const docRef = db.collection("aiUsage").doc(`${uid}_${dateKey}`);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(docRef);
    const data = snapshot.exists ? snapshot.data() : {};
    const current = Number(data[quotaField] || 0);
    const limit = DAILY_LIMITS[quotaField];

    if (current >= limit) {
      return {
        allowed: false,
        current,
        limit
      };
    }

    transaction.set(
      docRef,
      {
        uid,
        date: dateKey,
        [quotaField]: current + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    return {
      allowed: true,
      current: current + 1,
      limit
    };
  });
}

async function callGemini({ prompt, systemInstruction, apiKey }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 14000);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          }
        }),
        signal: controller.signal
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API failed with status ${response.status}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return sanitizeText(text, 1200);
  } finally {
    clearTimeout(timeout);
  }
}

function getPrompt(path, body) {
  if (path === "/ai/polish") {
    const text = sanitizeText(body.text, 500);
    return {
      systemInstruction: "You are a concise social media writing assistant.",
      prompt: `Rewrite this post to be clear, friendly, and concise. Return only the rewritten post.\n\nDraft: ${text}`
    };
  }

  if (path === "/ai/idea") {
    const context = sanitizeText(body.context, 300);
    return {
      systemInstruction: "You are a creative web development content assistant.",
      prompt: `Generate one engaging social media post idea (max 2 sentences) about web development or learning to code. Context: ${context}`
    };
  }

  if (path === "/ai/summarize") {
    const items = sanitizeFeedItems(body.feedItems);
    const mapped = items.map((item) => `- ${item.author}: ${item.content}`).join("\n");

    return {
      systemInstruction: "You summarize social feeds in two concise sentences.",
      prompt: `Summarize these recent posts in exactly two short sentences:\n${mapped}`
    };
  }

  return null;
}

exports.api = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 30,
    memory: "256MiB",
    secrets: [geminiApiKey]
  },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const cleanPath = req.path.replace(/^\/api/, "");
    const endpoint = ENDPOINT_CONFIG[cleanPath];

    if (!endpoint) {
      res.status(404).json({ error: "Unknown API endpoint" });
      return;
    }

    const requestId = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const uid = sanitizeText(req.body?.uid, 64) || "anonymous";

    try {
      const quota = await enforceDailyQuota(uid, endpoint.quotaField);

      if (!quota.allowed) {
        res.status(429).json({
          error: "Daily AI quota exceeded",
          requestId,
          fallbackUsed: true,
          result: endpoint.fallback
        });
        return;
      }

      const promptConfig = getPrompt(cleanPath, req.body || {});
      if (!promptConfig) {
        res.status(400).json({ error: "Invalid request payload", requestId });
        return;
      }

      const result = await callGemini({
        prompt: promptConfig.prompt,
        systemInstruction: promptConfig.systemInstruction,
        apiKey: geminiApiKey.value()
      });

      res.status(200).json({
        requestId,
        fallbackUsed: false,
        result: result || endpoint.fallback
      });
    } catch (error) {
      logger.error("AI endpoint failure", { requestId, error: error.message, path: cleanPath });
      res.status(200).json({
        requestId,
        fallbackUsed: true,
        result: endpoint.fallback,
        error: "AI temporarily unavailable"
      });
    }
  }
);
