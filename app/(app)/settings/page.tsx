import { SettingsForm } from "@/components/SettingsForm";
import { readStore } from "@/lib/store";

export default async function SettingsPage() {
  const { settings, lastAlertRun, xero } = await readStore();
  return (
    <>
      <h1>Settings</h1>
      <p className="sub">When a client counts as overdue, and who gets the alert emails.</p>
      <SettingsForm
        defaultThresholdDays={settings.defaultThresholdDays}
        alertEmails={settings.alertEmails}
        lastRun={lastAlertRun}
        connected={!!xero}
        alertHour={Number(process.env.ALERT_HOUR ?? 8)}
      />
      <div className="card">
        <strong>Xero</strong>
        <p>{xero ? `Connected to ${xero.tenantName}.` : "Not connected."}</p>
        <a className="button" href="/api/xero/connect">{xero ? "Reconnect Xero" : "Connect to Xero"}</a>
      </div>
    </>
  );
}
