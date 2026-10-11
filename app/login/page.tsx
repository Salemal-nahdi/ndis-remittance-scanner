export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main style={{ maxWidth: 360, margin: "15vh auto", padding: 16 }}>
      <div className="card">
        <h1>Sign in</h1>
        <form action="/api/login" method="post">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoFocus required style={{ width: "100%" }} />
          {error && <p className="error">That password isn't right.</p>}
          <button className="primary" type="submit" style={{ marginTop: 14, width: "100%" }}>Sign in</button>
        </form>
      </div>
    </main>
  );
}
