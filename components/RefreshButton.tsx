"use client";

import { useTransition } from "react";
import { refreshFromXero } from "@/app/actions";

export function RefreshButton({ syncedAt }: { syncedAt: string }) {
  const [pending, start] = useTransition();
  const time = new Date(syncedAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
  return (
    <span className="hint">
      Xero data from {time}{" "}
      <button disabled={pending} onClick={() => start(() => refreshFromXero())} style={{ marginLeft: 6 }}>
        {pending ? "Refreshing…" : "Refresh now"}
      </button>
    </span>
  );
}
