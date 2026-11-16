/** Web: reads the file (blob:/data: URL) and PUTs its bytes. */
export async function putFile(
  url: string,
  fileUri: string,
  token: string
): Promise<{ status: number; body: string }> {
  const blob = await (await fetch(fileUri)).blob();
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
    body: blob,
  });
  return { status: res.status, body: await res.text() };
}
