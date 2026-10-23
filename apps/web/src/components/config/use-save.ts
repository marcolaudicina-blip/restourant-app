"use client";

import { api, describeError } from "@/lib/api";
import { useRestaurantMutation } from "@/lib/queries";
import { useToast } from "../ui/toast";

type Method = "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * One mutation for configuration screens: `save(method, path, body?)` against the current restaurant,
 * refreshing the config snapshot and showing errors as toasts.
 */
export function useConfigSave() {
  const toast = useToast();
  const mutation = useRestaurantMutation(
    (base, vars: { method: Method; path: string; body?: unknown }) =>
      api(`${base}${vars.path}`, { method: vars.method, body: vars.body }),
    ["config", "availability", "restaurant"],
  );
  const save = (method: Method, path: string, body?: unknown, success?: string) =>
    mutation.mutateAsync({ method, path, body }).then(
      (result) => {
        if (success) toast.success(success);
        return result;
      },
      (error) => {
        toast.error(describeError(error));
        throw error;
      },
    );
  /** Fire-and-forget variant for inline edits: errors are already shown as toasts. */
  const run = (method: Method, path: string, body?: unknown, success?: string) => {
    save(method, path, body, success).catch(() => undefined);
  };
  return { save, run, pending: mutation.isPending };
}
