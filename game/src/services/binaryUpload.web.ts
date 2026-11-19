/** Web: reads the file (blob:/data: URL) and PUTs its bytes. */
import { getDeviceId } from './device';

export async function putFile(
  url: string,
  fileUri: string,
  token: string
): Promise<{ status: number; body: string }> {
  // Never send the session token over plain HTTP in release builds
  if (!__DEV__ && url.startsWith('http://')) throw new Error('The server address is not secure (https is required).');
  const blob = await (await fetch(fileUri)).blob();
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'X-Device-Id': await getDeviceId(),
    },
    body: blob,
  });
  return { status: res.status, body: await res.text() };
}
