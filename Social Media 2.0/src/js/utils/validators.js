const MAX_POST_LENGTH = 500;
const MAX_BIO_LENGTH = 160;
const MAX_COMMENT_LENGTH = 220;

export function sanitizeText(value) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeHandle(value) {
  const raw = sanitizeText(value).toLowerCase().replace(/^@+/, "");
  const cleaned = raw.replace(/[^a-z0-9_]/g, "");
  return cleaned ? `@${cleaned.slice(0, 24)}` : "";
}

export function validatePostContent(input) {
  const value = sanitizeText(input);

  if (!value) {
    return { ok: false, error: "Post content is required." };
  }

  if (value.length > MAX_POST_LENGTH) {
    return { ok: false, error: `Post cannot exceed ${MAX_POST_LENGTH} characters.` };
  }

  return { ok: true, value };
}

export function validateCommentContent(input) {
  const value = sanitizeText(input);

  if (!value) {
    return { ok: false, error: "Comment cannot be empty." };
  }

  if (value.length > MAX_COMMENT_LENGTH) {
    return { ok: false, error: `Comment cannot exceed ${MAX_COMMENT_LENGTH} characters.` };
  }

  return { ok: true, value };
}

export function validateProfilePatch(patch) {
  const displayName = sanitizeText(patch.displayName).slice(0, 40);
  const bio = sanitizeText(patch.bio).slice(0, MAX_BIO_LENGTH);
  const avatarUrl = sanitizeText(patch.avatarUrl).slice(0, 300);
  const handle = normalizeHandle(patch.handle || displayName);

  if (!displayName) {
    return { ok: false, error: "Display name is required." };
  }

  if (!handle) {
    return { ok: false, error: "A valid handle is required." };
  }

  if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) {
    return { ok: false, error: "Avatar URL must begin with http:// or https://" };
  }

  return {
    ok: true,
    value: {
      displayName,
      handle,
      bio,
      avatarUrl
    }
  };
}

export { MAX_POST_LENGTH, MAX_BIO_LENGTH, MAX_COMMENT_LENGTH };
