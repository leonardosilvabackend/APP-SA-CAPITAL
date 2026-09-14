import { expect, it } from "vitest";
import { canImportStock } from "./routes";

it.each(["admin", "advisor"])("allows %s to import SA stock", role => {
  expect(canImportStock(role)).toBe(true);
});

it.each(["administrative", "user", "partner"])("blocks %s from importing SA stock", role => {
  expect(canImportStock(role)).toBe(false);
});
