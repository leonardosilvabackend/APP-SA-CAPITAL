import { config } from "./config";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

export async function sendPasswordResetEmail(name: string, email: string, resetUrl: string) {
  if (!config.resendApiKey || !config.resendFromEmail) throw new Error("Resend não configurado");
  const safeName = escapeHtml(name);
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: config.resendFromEmail,
      to: email,
      subject: "SA Capital — Redefinição de senha",
      html: `<main style="font-family:Arial,sans-serif;color:#17243a;max-width:560px;margin:auto"><h1 style="color:#123458">Redefinição de senha</h1><p>Olá, ${safeName}.</p><p>Recebemos uma solicitação para redefinir sua senha na plataforma SA Capital.</p><p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#0b3767;color:white;text-decoration:none;font-weight:bold">Definir nova senha</a></p><p style="color:#718096;font-size:13px">O link é válido por uma hora e só pode ser usado uma vez. Se você não fez esta solicitação, ignore esta mensagem.</p></main>`,
      text: `Olá, ${name}.\n\nDefina sua nova senha pelo link: ${resetUrl}\n\nO link é válido por uma hora e só pode ser usado uma vez.`,
    }),
  });
  if (!response.ok) throw new Error(`Resend respondeu com status ${response.status}`);
}

export async function sendStatusEmail(name: string, email: string, subject: string, message: string) {
  if (!config.resendApiKey || !config.resendFromEmail) return;
  const response = await fetch(RESEND_ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: config.resendFromEmail, to: email, subject: `SA Capital — ${subject}`, html: `<main style="font-family:Arial,sans-serif;color:#17243a;max-width:560px;margin:auto"><h1 style="color:#123458">${escapeHtml(subject)}</h1><p>Olá, ${escapeHtml(name)}.</p><p>${escapeHtml(message)}</p></main>`, text: `Olá, ${name}.\n\n${message}` }) });
  if (!response.ok) console.error(`[E-mail] Resend respondeu com status ${response.status}`);
}
