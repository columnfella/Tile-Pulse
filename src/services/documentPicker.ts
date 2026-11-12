import { Platform } from 'react-native';

export interface PickedAudioResult {
  canceled: boolean;
  name?: string;
  uri?: string;
  blob?: Blob;
  size?: number;
}

/**
 * Universal Audio Document Picker
 * Supports expo-document-picker on native devices and HTML file input on Web.
 */
export async function pickAudioDocument(): Promise<PickedAudioResult> {
  if (Platform.OS === 'web') {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/mp3,audio/wav,audio/m4a,audio/*,.mp3,.wav,.m4a';

      input.onchange = (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const uri = URL.createObjectURL(file);
          resolve({
            canceled: false,
            name: file.name,
            uri,
            blob: file,
            size: file.size,
          });
        } else {
          resolve({ canceled: true });
        }
      };

      input.oncancel = () => {
        resolve({ canceled: true });
      };

      input.click();
    });
  }

  // Native Expo DocumentPicker
  try {
    // Dynamic import to support both Expo Go and web bundling
    const DocumentPicker = await import('expo-document-picker');
    const result = await DocumentPicker.getDocumentAsync({
      type: ['audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/*'],
      copyToCacheDirectory: true,
    });

    if (result.canceled) {
      return { canceled: true };
    }

    const asset = result.assets[0];
    return {
      canceled: false,
      name: asset.name,
      uri: asset.uri,
      size: asset.size,
    };
  } catch (err) {
    console.warn('Native DocumentPicker fallback:', err);
    return { canceled: true };
  }
}
