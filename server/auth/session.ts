import type { Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { config } from "../config";

export const SESSION_COOKIE = "sa_capital_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

function secretKey() {
  if (config.jwtSecret.length < 32) throw new Error("JWT_SECRET deve possuir ao menos 32 caracteres");
  return new TextEncoder().encode(config.jwtSecret);
}

export async function createSessionToken(userId: string) {
  return new SignJWT({ role: "user" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(secretKey());
}

export async function readSessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

function parseCookies(req: Request) {
  return Object.fromEntries((req.headers.cookie ?? "").split(";").map(item => item.trim()).filter(Boolean).map(item => {
    const separator = item.indexOf("=");
    if (separator < 0) return [item, ""];
    return [item.slice(0, separator), decodeURIComponent(item.slice(separator + 1))];
  }));
}

export function getSessionToken(req: Request) {
  return parseCookies(req)[SESSION_COOKIE];
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS * 1000,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    path: "/",
  });
}
