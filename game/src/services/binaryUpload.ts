/**
 * Native: streams a local file as the raw body of a PUT request (audio, cover
 * pictures). Web version in binaryUpload.web.ts.
 */
import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';

import { getDeviceId } from './device';

export async function putFile(
  url: string,
  fileUri: string,
  token: string
): Promise<{ status: number; body: string }> {
  // Never send the session token over plain HTTP in release builds
  if (!__DEV__ && url.startsWith('http://')) throw new Error('The server address is not secure (https is required).');
  const res = await uploadAsync(url, fileUri, {
    httpMethod: 'PUT',
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'X-Device-Id': await getDeviceId(),
    },
  });
  return { status: res.status, body: res.body };
}
