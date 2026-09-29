import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";

import { AuthProvider } from "../features/auth/AuthContext";
import { ApiError } from "../lib/api-client";
import { WSProvider } from "./WSProvider";

// WorkspaceProvider (beyond auth's own workspace_id/role) / PermissionProvider still
// land in a later milestone (05-Frontend-Architecture.md §5.4) - WSProvider needs
// AuthProvider's workspaceId, so it nests inside it.
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // A 4xx comes back the same every time (a bad filter, a deleted record, no
            // permission): show it now instead of after ~3s of "Loading…". Timeouts,
            // rate limits, 5xx and dropped connections still get two more tries.
            retry: (failureCount, error) => {
              if (
                error instanceof ApiError &&
                error.status >= 400 &&
                error.status < 500 &&
                error.status !== 408 &&
                error.status !== 429
              ) {
                return false;
              }
              return failureCount < 2;
            },
            staleTime: 30_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WSProvider>{children}</WSProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
