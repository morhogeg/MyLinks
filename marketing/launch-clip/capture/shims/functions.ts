/**
 * `firebase/functions` for the capture build: callables go to the capture
 * server (capture/server.mjs), the same place every `/api/*` call lands.
 */
export * from '@firebase/functions';
export const getFunctions = () => ({});
export const connectFunctionsEmulator = () => {};
export const httpsCallable =
  (_f: unknown, name: string) =>
  async (data: unknown) => {
    const res = await fetch(`/api/callable/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data ?? {}),
    });
    return { data: await res.json() };
  };
