import { ContactCleanup, type ClusterRow, type ContactRow } from "@/components/ContactCleanup";
import { NotConnected } from "@/components/NotConnected";
import { RefreshButton } from "@/components/RefreshButton";
import { findNdisNumber, looksLikeOrganisation } from "@/lib/duplicates";
import { getCleanupData, getNotDuplicates } from "@/lib/store";
import { ensureXeroData } from "@/lib/sync";

export default async function ContactsPage() {
  if (!(await ensureXeroData())) return <NotConnected />;
  const [snapshot, notDuplicates] = await Promise.all([getCleanupData(), getNotDuplicates()]);
  if (!snapshot) return <NotConnected />;
  const contactsById = new Map(snapshot.contacts.map((c) => [c.contactId, c]));

  const unpaid: Record<string, number> = {};
  for (const inv of snapshot.unpaidInvoices) unpaid[inv.contactId] = (unpaid[inv.contactId] ?? 0) + inv.amountDueCents;

  const contactRow = (id: string): ContactRow => {
    const c = contactsById.get(id)!;
    return {
      contactId: c.contactId,
      name: c.name,
      email: c.email ?? "",
      ndisNumber: findNdisNumber(c) ?? "",
      archived: !!c.archived,
      invoiceCount: snapshot.invoiceCounts[c.contactId] ?? 0,
      unpaidCents: unpaid[c.contactId] ?? 0,
    };
  };

  const active = snapshot.contacts.filter((c) => !c.archived);
  const clusters: ClusterRow[] = snapshot.duplicateClusters
    .filter((cl) => !notDuplicates.includes(cl.key))
    .filter((cl) => cl.contactIds.every((id) => contactsById.has(id)) && cl.contactIds.some((id) => !contactsById.get(id)?.archived))
    .map((cl) => ({ ...cl, members: cl.contactIds.map(contactRow) }));

  // Contacts that look like people but have no valid NDIS number recorded.
  const missingNdis = active
    .filter((c) => !looksLikeOrganisation(c.name) && !findNdisNumber(c) && (snapshot.invoiceCounts[c.contactId] ?? 0) > 0)
    .map((c) => contactRow(c.contactId));

  return (
    <>
      <h1>Contact clean-up</h1>
      <p className="sub">
        Contacts that look like the same client, and clients missing an NDIS number. Tidying these up helps payments
        match to the right invoices. <RefreshButton syncedAt={snapshot.syncedAt} />
      </p>
      <div className="stats">
        <div className="stat"><div className="stat-label">Possible duplicate groups</div><div className="stat-value">{clusters.length}</div></div>
        <div className="stat"><div className="stat-label">Missing NDIS number</div><div className="stat-value">{missingNdis.length}</div></div>
        <div className="stat"><div className="stat-label">Active contacts</div><div className="stat-value">{active.length}</div></div>
      </div>
      <ContactCleanup clusters={clusters} missingNdis={missingNdis} />
    </>
  );
}
