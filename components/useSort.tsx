"use client";

import { useMemo, useState, type ReactNode } from "react";

export type SortValue = string | number | null | undefined;
export interface SortState<K extends string> {
  key: K;
  dir: "asc" | "desc";
}

/**
 * Sorting for a table: click a heading to sort by it, click again to reverse.
 * Numbers sort largest-first on the first click; text sorts A-Z. Empty values go last.
 */
export function useSort<T, K extends string>(
  rows: T[],
  getValue: (row: T, key: K) => SortValue,
  initial: SortState<K>,
) {
  const [sort, setSort] = useState(initial);

  const sorted = useMemo(() => {
    const collator = new Intl.Collator("en-AU", { sensitivity: "base", numeric: true });
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = getValue(a, sort.key);
      const vb = getValue(b, sort.key);
      if (va == null || va === "") return vb == null || vb === "" ? 0 : 1;
      if (vb == null || vb === "") return -1;
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : collator.compare(String(va), String(vb));
      return cmp * sign;
    });
  }, [rows, sort, getValue]);

  function header(key: K, label: ReactNode, opts: { numeric?: boolean } = {}) {
    const active = sort.key === key;
    const onClick = () =>
      setSort((s) =>
        s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: opts.numeric ? "desc" : "asc" },
      );
    return (
      <th
        className={`sortable${opts.numeric ? " num" : ""}`}
        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
        onClick={onClick}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick())}
        tabIndex={0}
        scope="col"
      >
        {label}
        <span className="arrow" aria-hidden>
          {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </th>
    );
  }

  return { sorted, sort, header };
}
