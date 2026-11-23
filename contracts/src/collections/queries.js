// React Query for the collections screens: one board request (customers with payments, pickups, last sync),
// read through useBoard / useCollections / useSync, and every write refreshes it.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/use-toast";
import { errorText } from "@/sales/lib";
import { getBoard, listActivity } from "@/collections/api";

const BOARD = ["collections", "board"];
const ACTIVITY = ["collections", "activity"];

// signed out: back to the admin sign-in, like the other admin screens
const signedOut = (e) => {
  if (e?.status === 401) window.location.href = `${import.meta.env.BASE_URL}login`;
};

function useBoardQuery(select) {
  return useQuery({
    queryKey: BOARD,
    queryFn: () => getBoard().catch((e) => { signedOut(e); throw e; }),
    select,
    retry: (n, e) => e?.status !== 401 && n < 2,
  });
}

export const useBoard = () => useBoardQuery((d) => d.customers);
export const useCollections = () => useBoardQuery((d) => d.collections);
export const useSync = () => useBoardQuery((d) => ({ lastSync: d.lastSync, configured: d.kaspitConfigured }));

export function useActivity() {
  return useQuery({
    queryKey: ACTIVITY,
    queryFn: () => listActivity().catch((e) => { signedOut(e); throw e; }),
    retry: (n, e) => e?.status !== 401 && n < 2,
  });
}

export function useRefreshData() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: BOARD });
    queryClient.invalidateQueries({ queryKey: ACTIVITY });
  };
}

/** Runs a write, then refreshes the board and the history. */
export function useAction(fn, { success, onDone } = {}) {
  const refresh = useRefreshData();
  return useMutation({
    mutationFn: (data) => fn(data),
    onSuccess: (result) => {
      refresh();
      onDone?.(result);
      const msg = typeof success === "function" ? success(result) : success;
      if (msg) toast({ title: msg });
    },
    onError: (e) => {
      signedOut(e);
      toast({ title: errorText(e), variant: "destructive" });
    },
  });
}
