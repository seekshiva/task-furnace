declare module "@opencode-ai/sdk" {
  // Minimal client surface we use in the UI; the real SDK provides full types.
  export function createOpencodeClient(options?: {
    baseUrl?: string;
  }): {
    session: {
      list: () => Promise<any>;
      get: (args: { path: { id: string } }) => Promise<any>;
    };
  };
}

