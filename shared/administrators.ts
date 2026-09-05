import { z } from "zod";

export const imageTypes = ["image/png", "image/jpeg", "image/webp"] as const;
export const documentTypes = [...imageTypes, "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"] as const;
export const maxAttachmentBytes = 10 * 1024 * 1024;
const fileSchema = z.object({
  name: z.string().trim().min(1).max(255),
  mimeType: z.enum(documentTypes),
  base64: z.string().min(4).max(Math.ceil(maxAttachmentBytes / 3) * 4).regex(/^[A-Za-z0-9+/]*={0,2}$/).refine(value => value.length % 4 === 0, "Base64 invalido"),
});
export const administratorInputSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da administradora").max(160),
  characteristics: z.string().trim().min(1, "Informe as características").max(5000),
  website: z.string().trim().max(2000).refine(value => {
    if (!value) return true;
    try { return ["https:", "http:"].includes(new URL(value).protocol); } catch { return false; }
  }, "Informe um endereço HTTP ou HTTPS válido").default(""),
  logo: fileSchema.extend({ mimeType: z.enum(imageTypes) }).optional(),
  documents: z.array(fileSchema).max(10).default([]),
}).refine(value => [...(value.logo ? [value.logo] : []), ...value.documents].reduce((sum, file) => sum + file.base64.length * 3 / 4 - (file.base64.endsWith("==") ? 2 : file.base64.endsWith("=") ? 1 : 0), 0) <= maxAttachmentBytes, "Os arquivos juntos devem ter no máximo 10 MB");

export type AdministratorInput = z.infer<typeof administratorInputSchema>;
export type AdministratorFile = { id: string; name: string; mimeType: string; storagePath: string };
export type Administrator = { id: string; name: string; characteristics: string; website: string | null; logo?: string; documents: { id: string; name: string; url: string }[] };
