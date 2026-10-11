"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/receivables", label: "Overdue payments" },
  { href: "/contacts", label: "Contact clean-up" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const path = usePathname();
  return (
    <>
      {LINKS.map((l) => (
        // prefetch loads each tab's data ahead of time so clicking it is instant.
        <Link key={l.href} href={l.href} prefetch className={`nav-link${path === l.href ? " active" : ""}`}>
          {l.label}
        </Link>
      ))}
    </>
  );
}
