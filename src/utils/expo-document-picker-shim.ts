export async function getDocumentAsync(options?: {
  type?: string | string[];
  copyToCacheDirectory?: boolean;
  multiple?: boolean;
}) {
  return {
    canceled: true,
    assets: [],
  };
}
