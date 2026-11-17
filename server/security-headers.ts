import type { RequestHandler } from "express";
import { config } from "./config";

export const securityHeaders: RequestHandler = (req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (config.isProduction) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
    res.setHeader("Content-Security-Policy", "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  }
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  next();
};
