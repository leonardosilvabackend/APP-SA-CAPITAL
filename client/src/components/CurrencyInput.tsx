import { useLayoutEffect, useRef } from "react";
import { currencyInputText, currencyInputValue } from "../lib/currencyInput";

export default function CurrencyInput({ value, onChange, required = false }: { value: string; onChange: (value: string) => void; required?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const nextCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement === input && nextCaret.current !== null) {
      input.setSelectionRange(nextCaret.current, nextCaret.current);
    }
    nextCaret.current = null;
  }, [value]);
  return <input ref={inputRef} type="text" inputMode="decimal" maxLength={24} placeholder="R$ 0,00" required={required} value={value}
    onFocus={e => e.currentTarget.select()}
    onChange={e => {
      const input = e.currentTarget;
      const prefix = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/[^\d,]/g, "");
      const partial = currencyInputText(input.value);
      if (!partial) { nextCaret.current = null; onChange(""); return; }
      const formatted = currencyInputValue(partial).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      let count = 0, caret = 0;
      for (; caret < formatted.length && count < prefix.length; caret++) if (/[\d,]/.test(formatted[caret])) count++;
      nextCaret.current = caret;
      // Restore immediately, including when formatting produces the same value.
      // The layout effect reapplies it after React commits the controlled input.
      input.value = formatted;
      input.setSelectionRange(caret, caret);
      onChange(formatted);
    }}
    onBlur={() => { if (value) onChange(currencyInputValue(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })); }} />;
}
