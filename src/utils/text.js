// src/utils/text.js

export function sanitizeAIText(raw) {
  if (!raw) return "";
  let text = String(raw);
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  text = text.replace(/[^\u0009\u000A\u000D\u0020-\u007E\u00A0-\u00FF\u0400-\u04FF]/g, "");
  text = text.replace(/\b(image|img|photo|picture|avatar|icon|base64|data)\b[\s\S]*?\.(png|jpg|jpeg|gif|webp|bmp|svg)\b/gi, "");
  text = text.replace(/[A-Za-z0-9+\/]{20,}={0,2}/g, "");
  text = text.replace(/https?:\/\/[^\s]+/g, "");
  text = text.replace(/[A-Za-z]:\\[^\s]+/g, "");
  text = text.replace(/\s+/g, " ").trim();
  if (text.length > 4000) text = text.slice(0, 4000);
  return text;
}

export function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatRpText(text) {
  if (!text) return '';
  let escaped = escapeHtml(text);
  // 1. Direct spoken speech in quotes FIRST, before any HTML attributes are added:
  escaped = escaped.replace(/&quot;([^&]+?)&quot;/g, "<span class='rp-speech'>«$1»</span>");
  escaped = escaped.replace(/«([^»]+?)»/g, "<span class='rp-speech'>«$1»</span>");
  escaped = escaped.replace(/[“”]([^“”]+?)[“”]/g, "<span class='rp-speech'>«$1»</span>");
  // 2. Actions / physical acts / thoughts in **...** or *...*
  escaped = escaped.replace(/\*\*([^*]+?)\*\*/g, "<span class='rp-action'>*$1*</span>");
  escaped = escaped.replace(/\*([^*]+?)\*/g, "<span class='rp-action'>*$1*</span>");
  return escaped;
}
