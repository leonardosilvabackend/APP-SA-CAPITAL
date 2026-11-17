import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LandingPage from "./LandingPage";

describe("homepage institucional Cottus+", () => {
  const markup = renderToStaticMarkup(createElement(LandingPage));
  it("apresenta a narrativa institucional e identifica exemplos", () => {
    expect(markup).toContain("A plataforma para corretores");
    expect(markup).toContain("Exemplo demonstrativo");
    expect(markup).toContain("Sua operação. Sua marca. Sua identidade.");
  });
  it("mantém os recursos futuros explicitamente identificados", () => {
    expect(markup.match(/Em desenvolvimento/g)).toHaveLength(2);
    expect(markup).toContain("Capacidade planejada para uma etapa futura");
  });
  it("direciona o acesso existente para a rota de login", () => expect(markup).toContain('href="/login"'));
});
