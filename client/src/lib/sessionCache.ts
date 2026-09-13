import type { QueryClient } from "@tanstack/react-query";
import type { AuthenticatedUser } from "@shared/contracts";

export async function updateSessionCache(client: QueryClient, user: AuthenticatedUser | null) {
  // Prevent older requests from overwriting the new session or restoring private data.
  await client.cancelQueries();
  // Keep the mounted session observer attached; clear() destroys its query.
  client.removeQueries({ predicate: query => query.queryKey[0] !== "current-user" });
  client.setQueryData<AuthenticatedUser | null>(["current-user"], user);
}
