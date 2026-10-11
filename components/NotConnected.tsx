export function NotConnected() {
  return (
    <div className="card">
      <p>Connect your Xero organisation to see contacts and unpaid invoices. The app only reads from Xero.</p>
      <a className="button primary" href="/api/xero/connect">Connect to Xero</a>
    </div>
  );
}
