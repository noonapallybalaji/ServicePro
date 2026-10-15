import { apiUrl, session } from '@servicepro/api-client';

/** Downloads a file that needs the customer's sign-in (bills): fetch with the token, then save. */
export async function downloadProtected(path: string, fileName: string): Promise<void> {
  const get = () => fetch(apiUrl(path), { headers: { Authorization: `Bearer ${session.getAccessToken() ?? ''}` }, credentials: 'same-origin' });
  let response = await get();
  if (response.status === 401 && (await session.refresh())) response = await get();
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
