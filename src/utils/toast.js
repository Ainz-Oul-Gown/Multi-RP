// src/utils/toast.js — Система уведомлений
const CONTAINER_CLASS = 'toast-container';
let container = null;

function ensureContainer() {
  if (!container) {
    container = document.createElement('div');
    container.className = CONTAINER_CLASS;
    document.body.appendChild(container);
  }
}

export function showToast(message, type = 'info', duration = 4000) {
  ensureContainer();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

export const toast = {
  success: (msg) => showToast(msg, 'success'),
  error: (msg) => showToast(msg, 'error'),
  info: (msg) => showToast(msg, 'info'),
  warning: (msg) => showToast(msg, 'warning'),
};
