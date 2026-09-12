import { expect, it } from "vitest";
import { validateFile } from "./validation";
it("rejects empty, oversized and disguised documents", () => {
  for (const data of [Buffer.alloc(0), Buffer.from("<html>fake</html>"), Buffer.alloc(100)]) {
    expect(() => validateFile(data, "application/pdf", 32)).toThrow();
  }
});
it("checks signatures independently from the supplied filename", () => {
  expect(() => validateFile(Buffer.from("%PDF-1.7\n"), "application/pdf", 100)).not.toThrow();
  expect(() => validateFile(Buffer.from("%PDF-1.7\n"), "image/png", 100)).toThrow();
});
