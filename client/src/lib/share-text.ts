import { toast } from "sonner";
export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); toast.success("Informações copiadas para compartilhar"); }
  catch { toast.error("Não foi possível copiar. Verifique a permissão da área de transferência."); }
}
