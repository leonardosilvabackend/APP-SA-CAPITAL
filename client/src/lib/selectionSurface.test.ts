import { describe, expect, it, vi } from "vitest";
import type { KeyboardEvent, MouseEvent } from "react";
import { selectionSurface } from "./selectionSurface";

function click(control = false) {
  const nested = {};
  const currentTarget = { contains: () => true };
  return { button: 0, defaultPrevented: false, currentTarget, target: { closest: () => control ? nested : null } } as unknown as MouseEvent<HTMLElement>;
}
function key(value: string, nested = false) {
  const currentTarget = {};
  return { key: value, defaultPrevented: false, repeat: false, currentTarget, target: nested ? {} : currentTarget, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement>;
}
describe("whole-item selection", () => {
  it("activates when clicking an item's text or empty area", () => {
    const select = vi.fn();
    selectionSurface(select).onClick(click());
    expect(select).toHaveBeenCalledOnce();
  });
  it("does not activate when the click belongs to a checkbox, link or action button", () => {
    const select = vi.fn();
    selectionSurface(select).onClick(click(true));
    expect(select).not.toHaveBeenCalled();
  });
  it("keeps unavailable items disabled for mouse and keyboard", () => {
    const select = vi.fn();
    const handlers = selectionSurface(select, true);
    handlers.onClick(click()); handlers.onKeyDown(key("Enter"));
    expect(select).not.toHaveBeenCalled();
    expect(handlers.tabIndex).toBeUndefined();
  });
  it("supports Enter and Space without handling keys from nested controls", () => {
    const select = vi.fn(); const handlers = selectionSurface(select);
    handlers.onKeyDown(key("Enter"));
    const space = key(" "); handlers.onKeyDown(space);
    expect(space.preventDefault).toHaveBeenCalledOnce();
    handlers.onKeyDown(key("Enter", true)); handlers.onKeyDown(key("ArrowDown"));
    expect(select).toHaveBeenCalledTimes(2);
  });
});
