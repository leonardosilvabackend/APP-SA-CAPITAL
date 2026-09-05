import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  ExternalLink,
  FileText,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { selectionSurface } from "../lib/selectionSurface";
import { administratorInputSchema, documentTypes, imageTypes, maxAttachmentBytes, type Administrator, type AdministratorInput } from "@shared/administrators";

type AdministradorasPageProps = { isAdmin: boolean };
async function request(options?: RequestInit) {
  const response = await fetch("/api/administrators", { credentials: "same-origin", ...options, headers: { "Content-Type": "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Não foi possível concluir a operação");
  return data;
}
function readFile(file: File): Promise<AdministratorInput["documents"][number]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo"));
    reader.onload = () => resolve({ name: file.name, mimeType: file.type as AdministratorInput["documents"][number]["mimeType"], base64: String(reader.result).split(",")[1] });
    reader.readAsDataURL(file);
  });
}

export function AdministradorasPage({
  isAdmin,
}: AdministradorasPageProps) {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const list = useQuery<{ items: Administrator[] }>({ queryKey: ["administrators"], queryFn: () => request() });
  const administrators = list.data?.items ?? [];
  const [sending, setSending] = useState(false);
  const [logoFile, setLogoFile] = useState<File>();
  const [documents, setDocuments] = useState<File[]>([]);
  const [selected, setSelected] = useState<Administrator | null>(null);

  const [modalOpen, setModalOpen] = useState(false);

  const [name, setName] = useState("");
  const [characteristics, setCharacteristics] = useState("");
  const [website, setWebsite] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | undefined>();

  const filteredAdministrators = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return administrators;
    }

    return administrators.filter((administrator) =>
      administrator.name.toLowerCase().includes(normalizedSearch),
    );
  }, [administrators, search]);

  function resetForm() {
    setName("");
    setCharacteristics("");
    setWebsite("");
    setLogoPreview(undefined);
    setLogoFile(undefined);
    setDocuments([]);
  }

  function closeModal() {
    if (sending) return;
    setModalOpen(false);
    resetForm();
  }

  function handleLogo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!imageTypes.includes(file.type as typeof imageTypes[number]) || file.size > maxAttachmentBytes) {
      event.target.value = "";
      toast.error("Selecione PNG, JPEG ou WebP de até 10 MB");
      return;
    }
    setLogoFile(file);
  }

  useEffect(() => {
    if (!logoFile) { setLogoPreview(undefined); return; }
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || !isAdmin) return;
    if ([...(logoFile ? [logoFile] : []), ...documents].reduce((sum, file) => sum + file.size, 0) > maxAttachmentBytes) {
      toast.error("Os arquivos juntos devem ter no máximo 10 MB");
      return;
    }
    setSending(true);
    try {
      const input = administratorInputSchema.safeParse({ name, characteristics, website, logo: logoFile ? await readFile(logoFile) : undefined, documents: await Promise.all(documents.map(readFile)) });
      if (!input.success) throw new Error(input.error.issues[0]?.message);
      const data: { item: Administrator } = await request({ method: "POST", body: JSON.stringify(input.data) });
      queryClient.setQueryData<{ items: Administrator[] }>(["administrators"], current => ({ items: [...(current?.items ?? []), data.item].sort((a, b) => a.name.localeCompare(b.name)) }));
      void queryClient.invalidateQueries({ queryKey: ["administrators"] });
      toast.success("Administradora salva com sucesso");
      setModalOpen(false);
      resetForm();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="administrators-page">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">
            CONFIGURAÇÕES COMERCIAIS
          </span>

          <h1>Administradoras</h1>

          <p>
            Consulte informações, características e documentos
            das administradoras disponíveis na plataforma.
          </p>
        </div>

        {isAdmin && (
          <button
            className="primary-button"
            onClick={() => setModalOpen(true)}
          >
            <Plus size={17} />
            Adicionar administradora
          </button>
        )}
      </div>

      <div className="administrator-toolbar panel">
        <div className="administrator-search">
          <Search size={17} />

          <input
            placeholder="Buscar administradora..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <span>
          {filteredAdministrators.length} administradora
          {filteredAdministrators.length !== 1 ? "s" : ""}
        </span>
      </div>

      {list.isLoading ? <p role="status">Carregando administradoras…</p> : list.isError ? (
        <div className="empty-state" role="alert"><p>{list.error.message}</p><button className="secondary-button" onClick={() => void list.refetch()}>Tentar novamente</button></div>
      ) : filteredAdministrators.length === 0 ? (
        <div className="empty-state">
          <span>
            <Building2 size={27} />
          </span>

          <h2>Nenhuma administradora encontrada</h2>

          <p>
            {search.trim() ? "Nenhuma administradora corresponde a esta busca." : "Nenhuma administradora cadastrada ainda."}
          </p>
        </div>
      ) : (
        <div className="administrators-grid">
          {filteredAdministrators.map((administrator) => (
            <article
              key={administrator.id}
              className="administrator-card"
              {...selectionSurface(() => setSelected(administrator))}
              aria-label={`Consultar documentos de ${administrator.name}`}
            >
              <div className="administrator-card-header">
                <div className="administrator-logo">
                  {administrator.logo ? (
                    <img
                      src={administrator.logo}
                      alt={administrator.name}
                    />
                  ) : (
                    <Building2 size={25} />
                  )}
                </div>

                <div>
                  <span>ADMINISTRADORA</span>
                  <h2>{administrator.name}</h2>
                </div>
              </div>

              <p className="administrator-description">
                {administrator.characteristics}
              </p>

              <div className="administrator-card-footer">
                {administrator.website && (
                  <a
                    href={administrator.website}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={15} />
                    Site oficial
                  </a>
                )}

                <button type="button" onClick={() => setSelected(administrator)}>
                  <FileText size={15} />

                  {administrator.documents.length > 0
                    ? `${administrator.documents.length} documento(s)`
                    : "Documentos"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {selected && <div className="modal-backdrop"><div className="administrator-modal" role="dialog" aria-modal="true" aria-label="Documentos da administradora">
        <div className="modal-heading"><h2>Documentos — {selected.name}</h2><button className="icon-button" aria-label="Fechar documentos" onClick={() => setSelected(null)}><X size={18}/></button></div>
        {selected.documents.length ? <ul>{selected.documents.map(doc => <li key={doc.id}><a href={doc.url} target="_blank" rel="noreferrer">{doc.name}</a></li>)}</ul> : <p>Nenhum documento cadastrado.</p>}
      </div></div>}
      {modalOpen && isAdmin && (
        <div className="modal-backdrop">
          <div className="administrator-modal">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  NOVA ADMINISTRADORA
                </span>

                <h2>Adicionar administradora</h2>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={closeModal}
                disabled={sending}
              >
                <X size={18} />
              </button>
            </div>

            <form
              className="administrator-form"
              onSubmit={handleSubmit}
            >
              <label>
                Logo

                <div className="administrator-logo-upload">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Pré-visualização"
                    />
                  ) : (
                    <>
                      <Upload size={24} />
                      <span>Selecionar logo</span>
                    </>
                  )}

                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleLogo}
                    disabled={sending}
                  />
                </div>
              </label>

              <label>
                Nome da administradora

                <input
                  value={name}
                  disabled={sending}
                  minLength={2}
                  maxLength={160}
                  onChange={(event) =>
                    setName(event.target.value)
                  }
                  placeholder="Ex.: Porto Seguro"
                  required
                />
              </label>

              <label>
                Características

                <textarea
                  value={characteristics}
                  disabled={sending}
                  maxLength={5000}
                  onChange={(event) =>
                    setCharacteristics(event.target.value)
                  }
                  placeholder="Descreva as principais características, regras, segmentos..."
                  required
                />
              </label>

              <label>
                Link

                <input
                  type="url"
                  value={website}
                  disabled={sending}
                  maxLength={2000}
                  onChange={(event) =>
                    setWebsite(event.target.value)
                  }
                  placeholder="https://..."
                />
              </label>

              <label>
                Documentos

                <div className="administrator-document-upload">
                  <FileText size={20} />

                  <div>
                    <strong>Adicionar documentos</strong>
                    <span>
                      PDF, Word, Excel, PNG, JPEG ou WebP. Total de até 10 MB com a logo.
                    </span>
                  </div>

                  <input
                    type="file"
                    multiple
                    accept={documentTypes.join(",")}
                    disabled={sending}
                    onChange={event => {
                      const files = Array.from(event.target.files ?? []);
                      if (files.length > 10 || files.some(file => !documentTypes.includes(file.type as typeof documentTypes[number]))) {
                        toast.error("Selecione até 10 documentos nos formatos indicados");
                        event.target.value = "";
                        return;
                      }
                      setDocuments(files);
                    }}
                  />
                </div>
              </label>

              {documents.length > 0 && <ul>{documents.map((file, index) => <li key={index}>{file.name}</li>)}</ul>}
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeModal}
                disabled={sending}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={sending}
                  className="primary-button"
                >
                  {sending ? "Salvando…" : "Salvar administradora"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
