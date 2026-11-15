import * as DocumentPicker from 'expo-document-picker';

export interface PickedAudioResult {
  canceled: boolean;
  name?: string;
  uri?: string;
  /** Web only: the underlying File object, used to persist it in IndexedDB. */
  file?: Blob;
  size?: number;
}

/**
 * Opens the system file picker for an audio file.
 * expo-document-picker works on iOS, Android and web.
 */
export async function pickAudioDocument(): Promise<PickedAudioResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['audio/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.length) {
    return { canceled: true };
  }

  const asset = result.assets[0];
  return {
    canceled: false,
    name: asset.name,
    uri: asset.uri,
    file: asset.file,
    size: asset.size,
  };
}
