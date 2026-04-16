import { useState, useEffect, useCallback } from "preact/hooks";

export function useSettings() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const resp = await fetch("/admin/settings");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data: { proxy_api_key: string | null } = await resp.json();
      setApiKey(data.proxy_api_key);
      setLoaded(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const save = useCallback(async (newKey: string | null) => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      // Send current key for auth if one exists
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
      const resp = await fetch("/admin/settings", {
        method: "POST",
        headers,
        body: JSON.stringify({ proxy_api_key: newKey }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error((data as { error?: string }).error ?? `HTTP ${resp.status}`);
      }
      const result: { proxy_api_key: string | null } = await resp.json();
      setApiKey(result.proxy_api_key);
      setSaved(true);
      // Auto-clear saved indicator after 3s
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [apiKey]);

  useEffect(() => { load(); }, [load]);

  return { apiKey, loaded, saving, saved, error, save, load };
}
