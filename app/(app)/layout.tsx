import { connection } from "next/server";
import { Nav } from "@/components/Nav";
import { readStore } from "@/lib/store";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Every page here shows live data, so never pre-render at build time.
  await connection();
  const { xero } = await readStore();
  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">Remittance Scanner</div>
        <Nav />
        <div className="sidebar-foot">
          {xero ? `Xero: ${xero.tenantName}` : "Xero not connected"}
          <form action="/api/logout" method="post">
            <button type="submit" style={{ marginTop: 8, padding: "4px 10px", fontSize: 12 }}>Sign out</button>
          </form>
        </div>
      </nav>
      <main>{children}</main>
    </div>
  );
}
