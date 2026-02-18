/**
 * Shared SWR fetcher that throws on non-ok HTTP responses.
 * Without this, SWR treats 500 responses as successful data.
 */
export async function fetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Request failed: ${res.status}`);
  }
  return res.json();
}
