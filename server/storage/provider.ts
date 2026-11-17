import { createClient } from "@supabase/supabase-js";
import { config } from "../config";

export type StorageFailure = { message: string };
export type StorageOperation = { error: StorageFailure | null };
export type SignedObject = { data: { signedUrl: string } | null; error: StorageFailure | null };

export interface StorageProvider {
  upload(path: string, body: Buffer, options: { contentType: string; upsert: boolean }): Promise<StorageOperation>;
  remove(paths: string[]): Promise<StorageOperation>;
  createSignedUrl(path: string, expiresInSeconds: number, options?: { download: string }): Promise<SignedObject>;
}

type SupabaseBucket = ReturnType<ReturnType<typeof createClient>["storage"]["from"]>;

export class SupabaseStorageProvider implements StorageProvider {
  constructor(private readonly bucket: SupabaseBucket) {}

  async upload(path: string, body: Buffer, options: { contentType: string; upsert: boolean }): Promise<StorageOperation> {
    const result = await this.bucket.upload(path, body, options);
    return { error: result.error ? { message: result.error.message } : null };
  }

  async remove(paths: string[]): Promise<StorageOperation> {
    const result = await this.bucket.remove(paths);
    return { error: result.error ? { message: result.error.message } : null };
  }

  async createSignedUrl(path: string, expiresInSeconds: number, options?: { download: string }): Promise<SignedObject> {
    const result = await this.bucket.createSignedUrl(path, expiresInSeconds, options);
    return {
      data: result.data?.signedUrl ? { signedUrl: result.data.signedUrl } : null,
      error: result.error ? { message: result.error.message } : null,
    };
  }
}

export function storageIsConfigured() {
  return Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);
}

export function storageProvider(): StorageProvider {
  if (!storageIsConfigured()) throw new Error("Storage provider não configurado");
  const client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return new SupabaseStorageProvider(client.storage.from(config.storageBucket));
}
