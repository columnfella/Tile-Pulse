// Metro's require.context (enabled by Expo): bundles every file in a folder
// that matches a pattern. Used for the menu music playlist.
export {};

declare global {
  interface RequireContext {
    keys(): string[];
    (id: string): any;
  }
  interface NodeRequire {
    context(directory: string, recursive?: boolean, filter?: RegExp): RequireContext;
  }
}
