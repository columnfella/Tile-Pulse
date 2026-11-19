/**
 * Small secrets on the device (session token, device id), phone app version:
 * the OS keystore via expo-secure-store (Android Keystore / iOS Keychain).
 * The web version is secureKeyValue.web.ts (browser storage).
 */
import * as SecureStore from 'expo-secure-store';

export const secureKeyValue = {
  get: (key: string): Promise<string | null> => SecureStore.getItemAsync(key),
  set: (key: string, value: string): Promise<void> => SecureStore.setItemAsync(key, value),
  remove: (key: string): Promise<void> => SecureStore.deleteItemAsync(key),
};
