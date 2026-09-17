import {expect,it} from "vitest";
import {currencyInputText,currencyInputValue} from "./currencyInput";
it("groups whole reais without dividing them by one hundred",()=>{
 expect(currencyInputText("1000000")).toBe("R$ 1.000.000");
 expect(currencyInputValue("R$ 1.000.000,00")).toBe(1000000);
 expect(currencyInputValue("R$ 1.234,56")).toBe(1234.56);
});
it("supports clearing, decimal input and limits fractional precision",()=>{
 expect(currencyInputText("")).toBe("");expect(currencyInputText(",5")).toBe("R$ 0,5");
 expect(currencyInputText("R$ 20,123")).toBe("R$ 20,12");
});
