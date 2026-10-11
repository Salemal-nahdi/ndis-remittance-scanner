/** Shown for the split second before a tab's data arrives, so the click responds immediately. */
export default function Loading() {
  return (
    <div aria-busy="true">
      <div className="skeleton" style={{ height: 26, width: 260, marginBottom: 10 }} />
      <div className="skeleton" style={{ height: 16, width: 420, marginBottom: 24 }} />
      <div className="stats">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 70 }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: 320 }} />
    </div>
  );
}
