/**
 * Native: streams a local file as the raw body of a PUT request (audio, cover
 * pictures). Web version in binaryUpload.web.ts.
 */
import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';

export async function putFile(
  url: string,
  fileUri: string,
  token: string
): Promise<{ status: number; body: string }> {
  const res = await uploadAsync(url, fileUri, {
    httpMethod: 'PUT',
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
  });
  return { status: res.status, body: res.body };
}
