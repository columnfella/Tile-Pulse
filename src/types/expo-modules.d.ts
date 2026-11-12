declare module 'expo-router' {
  export interface Router {
    push: (href: string | { pathname: string; params?: Record<string, any> }) => void;
    replace: (href: string | { pathname: string; params?: Record<string, any> }) => void;
    back: () => void;
  }

  export function useRouter(): Router;
  export function useLocalSearchParams<T extends Record<string, any> = Record<string, string>>(): T;

  export const Stack: any;
  export const Tabs: any;
}

declare module 'expo-document-picker' {
  export interface DocumentPickerAsset {
    name: string;
    size?: number;
    uri: string;
    mimeType?: string;
  }

  export interface DocumentPickerResult {
    canceled: boolean;
    assets: DocumentPickerAsset[];
  }

  export function getDocumentAsync(options?: {
    type?: string | string[];
    copyToCacheDirectory?: boolean;
    multiple?: boolean;
  }): Promise<DocumentPickerResult>;
}

declare module 'expo-audio' {
  export interface AudioPlayer {
    play: () => void;
    pause: () => void;
    currentTime: number;
    duration: number;
    playing: boolean;
  }
}

declare module 'expo-file-system' {
  export const documentDirectory: string | null;
  export const cacheDirectory: string | null;
  export function copyAsync(options: { from: string; to: string }): Promise<void>;
  export function getInfoAsync(fileUri: string): Promise<{ exists: boolean; size?: number }>;
}

declare module '@react-native-async-storage/async-storage' {
  const AsyncStorage: {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
    removeItem: (key: string) => Promise<void>;
    clear: () => Promise<void>;
  };
  export default AsyncStorage;
}
