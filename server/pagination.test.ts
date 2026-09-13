import { expect, it } from "vitest";
import { pagination, pageResult } from "./pagination";
it("bounds page input and uses a sentinel without an unbounded count", () => {
  expect(pagination({ query: { page: "Infinity", pageSize: "100000" } } as any)).toEqual({ page: 1, pageSize: 100, offset: 0 });
  expect(pageResult([1, 2, 3], { page: 2, pageSize: 2, offset: 2 })).toEqual({ items: [1, 2], page: 2, pageSize: 2, hasNext: true });
});
