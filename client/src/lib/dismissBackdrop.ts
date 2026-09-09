import type { MouseEvent, PointerEvent } from "react";

/** Only dismiss gestures that start and end on this backdrop. */
export function dismissBackdrop(onClose: () => void, disabled = false) {
  let startedOutside = false;
  return {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      startedOutside = event.target === event.currentTarget;
    },
    onClick(event: MouseEvent<HTMLDivElement>) {
      if (!disabled && startedOutside && event.target === event.currentTarget) {
        event.stopPropagation();
        onClose();
      }
      startedOutside = false;
    },
  };
}
