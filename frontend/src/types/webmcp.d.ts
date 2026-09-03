/** Minimal typings for the WebMCP imperative API (document.modelContext / navigator.modelContext). */
export interface ModelContextToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
  untrustedContentHint?: boolean;
}

export interface ModelContextToolDefinition<Input = Record<string, unknown>> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Input, context?: { signal?: AbortSignal }) => Promise<unknown> | unknown;
  annotations?: ModelContextToolAnnotations;
}

export interface ModelContextRegisterOptions {
  signal?: AbortSignal;
  exposedTo?: string[];
}

export interface ModelContext {
  registerTool(tool: ModelContextToolDefinition<any>, options?: ModelContextRegisterOptions): Promise<void> | void;
  unregisterTool?(name: string): Promise<void> | void;
  provideContext?(context: { tools: ModelContextToolDefinition<any>[] }): void;
  clearContext?(): void;
}

declare global {
  interface Document { modelContext?: ModelContext }
  interface Navigator { modelContext?: ModelContext }
}
