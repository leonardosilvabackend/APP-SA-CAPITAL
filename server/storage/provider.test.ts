import { describe, expect, it, vi } from "vitest";
import { SupabaseStorageProvider } from "./provider";

function providerWith(bucket: Record<string, unknown>) {
  return new SupabaseStorageProvider(bucket as never);
}

describe("StorageProvider", () => {
  it("preserva caminho, conteúdo e política de upload", async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: "logos/item.webp" }, error: null });
    const provider = providerWith({ upload });
    const body = Buffer.from("image");

    await expect(provider.upload("logos/item.webp", body, { contentType: "image/webp", upsert: false }))
      .resolves.toEqual({ error: null });
    expect(upload).toHaveBeenCalledWith("logos/item.webp", body, { contentType: "image/webp", upsert: false });
  });

  it("preserva duração e nome de download da URL assinada", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://storage.test/signed" }, error: null });
    const provider = providerWith({ createSignedUrl });

    await expect(provider.createSignedUrl("private/document.pdf", 60, { download: "document.pdf" }))
      .resolves.toEqual({ data: { signedUrl: "https://storage.test/signed" }, error: null });
    expect(createSignedUrl).toHaveBeenCalledWith("private/document.pdf", 60, { download: "document.pdf" });
  });

  it("normaliza erros sem expor detalhes do SDK", async () => {
    const remove = vi.fn().mockResolvedValue({ data: null, error: { message: "provider failed", statusCode: 500 } });
    const provider = providerWith({ remove });

    await expect(provider.remove(["old/object"])).resolves.toEqual({ error: { message: "provider failed" } });
  });
});
