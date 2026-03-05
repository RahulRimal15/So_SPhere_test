import { callAiEndpoint } from "../services/api.js";
import { setButtonBusy, showToast } from "./ui.js";
import { sanitizeText } from "../utils/validators.js";

let getSessionRef = () => null;
let getFeedRef = () => [];

const fallbackIdeas = [
  "What web development concept challenged you this week, and how did you solve it?",
  "Share one small UI detail that made your app feel more professional.",
  "Post a before/after of a bug fix and what you learned from debugging it.",
  "Write about one tool in your workflow that saved you real time today."
];

function fallbackPolish(text) {
  const cleaned = sanitizeText(text);
  if (!cleaned) {
    return "";
  }
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function fallbackSummary(posts) {
  if (!posts.length) {
    return "No active discussions yet. Create a post to start the feed.";
  }

  const topics = posts
    .slice(0, 5)
    .map((post) => post.content)
    .join(" ")
    .toLowerCase();

  if (topics.includes("firebase")) {
    return "Recent posts highlight Firebase integration and app reliability improvements. The team is focused on shipping stable features quickly.";
  }

  if (topics.includes("ui") || topics.includes("design")) {
    return "Design and UI improvements are trending in the feed right now. Members are iterating quickly and sharing practical implementation tips.";
  }

  return "The feed is focused on web development progress updates and collaborative problem solving. Activity shows steady momentum toward project milestones.";
}

export const aiService = {
  async polish(text) {
    const session = getSessionRef();
    const fallback = fallbackPolish(text);

    const response = await callAiEndpoint(
      "polish",
      {
        uid: session?.uid,
        text,
        clientTs: new Date().toISOString()
      },
      fallback
    );

    return response.result;
  },

  async suggestIdea(context = "") {
    const session = getSessionRef();
    const fallback = fallbackIdeas[Math.floor(Math.random() * fallbackIdeas.length)];

    const response = await callAiEndpoint(
      "idea",
      {
        uid: session?.uid,
        context,
        clientTs: new Date().toISOString()
      },
      fallback
    );

    return response.result;
  },

  async summarize(feedItems) {
    const session = getSessionRef();
    const fallback = fallbackSummary(feedItems);

    const response = await callAiEndpoint(
      "summarize",
      {
        uid: session?.uid,
        feedItems: feedItems.slice(0, 10).map((post) => ({
          author: post.authorName,
          content: post.content
        })),
        clientTs: new Date().toISOString()
      },
      fallback
    );

    return response.result;
  }
};

export function initAiModule({ getSession, getFeed }) {
  getSessionRef = getSession;
  getFeedRef = getFeed;

  const postInput = document.getElementById("post-input");
  const polishButton = document.getElementById("ai-polish-btn");
  const ideaButton = document.getElementById("ai-idea-btn");
  const summaryButton = document.getElementById("ai-summary-btn");
  const summaryText = document.getElementById("ai-summary-text");

  polishButton.addEventListener("click", async () => {
    const text = sanitizeText(postInput.value);
    if (!text) {
      showToast("Write a draft first to polish.", "error");
      return;
    }

    setButtonBusy(polishButton, "Polishing...", true);
    try {
      const polished = await aiService.polish(text);
      postInput.value = polished;
      showToast("Draft polished.", "success");
    } catch (error) {
      showToast(error.message || "AI polish failed.", "error");
    } finally {
      setButtonBusy(polishButton, "", false);
    }
  });

  ideaButton.addEventListener("click", async () => {
    setButtonBusy(ideaButton, "Thinking...", true);
    try {
      const idea = await aiService.suggestIdea(postInput.value);
      postInput.value = idea;
      showToast("Idea generated.", "success");
    } catch (error) {
      showToast(error.message || "AI idea failed.", "error");
    } finally {
      setButtonBusy(ideaButton, "", false);
    }
  });

  summaryButton.addEventListener("click", async () => {
    setButtonBusy(summaryButton, "Summarizing...", true);
    try {
      const summary = await aiService.summarize(getFeedRef());
      summaryText.textContent = summary;
      showToast("Feed summary refreshed.", "success");
    } catch (error) {
      showToast(error.message || "AI summary failed.", "error");
    } finally {
      setButtonBusy(summaryButton, "", false);
    }
  });
}
