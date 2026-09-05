import type { KeyboardEvent, MouseEvent } from "react";

const controls = "a, button, input, select, textarea, label, [role='button'], [role='link'], [contenteditable='true'], [data-independent-action]";

/** Expand the primary action without intercepting the item's own controls. */
export function selectionSurface(onSelect: () => void, disabled = false) {
  return {
    tabIndex: disabled ? undefined : 0,
    "data-selectable": disabled ? undefined : "true",
    onClick(event: MouseEvent<HTMLElement>) {
      if (disabled || event.defaultPrevented || event.button !== 0) return;
      const control = (event.target as Element).closest(controls);
      if (control && control !== event.currentTarget && event.currentTarget.contains(control)) return;
      onSelect();
    },
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      if (disabled || event.defaultPrevented || event.repeat || event.target !== event.currentTarget) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect();
      }
    },
  };
}
