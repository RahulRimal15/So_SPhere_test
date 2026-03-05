function createToastElement(message, tone) {
  const el = document.createElement("div");
  el.className = `toast ${tone ? `toast--${tone}` : ""}`.trim();
  el.textContent = message;
  return el;
}

export function showToast(message, tone = "success") {
  const container = document.getElementById("toast-container");
  if (!container) {
    return;
  }

  const toast = createToastElement(message, tone);
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-6px)";
    toast.style.transition = "all 220ms ease";
    setTimeout(() => toast.remove(), 220);
  }, 2800);
}

export function setButtonBusy(button, busyText, isBusy) {
  if (!button) {
    return;
  }

  if (!button.dataset.idleText) {
    button.dataset.idleText = button.textContent;
  }

  button.disabled = isBusy;
  button.textContent = isBusy ? busyText : button.dataset.idleText;
}

export function showSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (section) {
    section.classList.remove("hidden");
  }
}

export function hideSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (section) {
    section.classList.add("hidden");
  }
}
