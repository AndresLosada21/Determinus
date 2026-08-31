declare module "@opencode-ai/plugin" {
  export namespace Plugin {
    export interface Registration { dispose(): Promise<void> }
    export interface LocationInfo {
      directory: string
      workspaceID?: string
      project: { id: string; directory: string; canonical: string }
    }
    export interface Context {
      readonly app: { version?: string }
      readonly location: LocationInfo
      readonly storage: {
        get(key: string): Promise<unknown | undefined>
        set(key: string, value: unknown): Promise<void>
        remove(key: string): Promise<void>
        scan(options: { prefix: string; after?: string; limit?: number }): Promise<{ entries: readonly { key: string; value: unknown }[]; next?: string }>
      }
      readonly agent: {
        transform(callback: (draft: any) => void): Promise<Registration>
        list(input?: { location?: { directory?: string; workspace?: string } }): Promise<{ location: LocationInfo; data: readonly any[] }>
      }
      readonly skill: {
        list(input?: { location?: { directory?: string; workspace?: string } }): Promise<{ location: LocationInfo; data: readonly any[] }>
      }
      readonly plugin: {
        list(input?: { location?: { directory?: string; workspace?: string } }): Promise<{ location: LocationInfo; data: readonly any[] }>
      }
      readonly session: {
        create(input?: { title?: string; agent?: string; model?: { id: string; providerID: string; variant?: string }; location?: { directory: string; workspaceID?: string } }): Promise<{ id: string; sessionID?: string; location: { directory: string; workspaceID?: string }; agent?: string; model?: { id: string; providerID: string; variant?: string }; outcome?: "succeeded" | "failed" | "interrupted"; tokens?: { input?: number; output?: number; reasoning?: number } }>
        get(input: { sessionID: string }): Promise<{ id?: string; sessionID?: string; location: { directory: string; workspaceID?: string }; agent?: string; model?: { id: string; providerID: string; variant?: string }; outcome?: "succeeded" | "failed" | "interrupted"; tokens?: { input?: number; output?: number; reasoning?: number } }>
        context(input: { sessionID: string }): Promise<readonly any[]>
        wait(input: { sessionID: string }): Promise<void>
        interrupt(input: { sessionID: string; continue?: boolean }): Promise<unknown>
        hook(name: "context" | "retry", callback: (event: any) => void | Promise<void>): Promise<Registration>
        synthetic(input: { sessionID: string; text: string; description?: string; metadata?: Record<string, unknown>; delivery?: "steer" | "queue"; resume?: boolean }): Promise<unknown>
        prompt(input: { id?: string; sessionID: string; text: string; files?: readonly unknown[]; agents?: readonly unknown[]; skills?: readonly unknown[]; metadata?: Record<string, unknown>; delivery?: "steer" | "queue"; resume?: boolean }): Promise<{ id: string; sessionID: string; type: "user"; delivery: "steer" | "queue"; payload?: unknown }>
        switchAgent(input: { sessionID: string; agent: string }): Promise<void>
        switchModel(input: { sessionID: string; model: { id: string; providerID: string; variant?: string } }): Promise<void>
      }
      readonly permission: {
        hook(name: "evaluate", callback: (event: any) => void | Promise<void>): Promise<Registration>
      }
      readonly tool: {
        transform(callback: (draft: any) => void): Promise<Registration>
      }
      readonly command: {
        transform(callback: (draft: any) => void): Promise<Registration>
      }
      readonly vcs: {
        get(input?: { location?: { directory?: string; workspace?: string } }): Promise<{ location: LocationInfo; data: any }>
        status(input?: { location?: { directory?: string; workspace?: string } }): Promise<{ location: LocationInfo; data: readonly any[] }>
        branches(input?: { location?: { directory?: string; workspace?: string }; search?: string; limit?: number }): Promise<{ location: LocationInfo; data: readonly string[] }>
        diff(input: { location?: { directory?: string; workspace?: string }; mode: "working" | "branch" | "committed"; base?: string; context?: number }): Promise<{ location: LocationInfo; data: readonly any[] }>
      }
      readonly integration: {
        connection: {
          active(integrationID: string): Promise<any | undefined>
          resolve(connection: any): Promise<unknown | undefined>
        }
      }
    }
    export interface Definition {
      id: string
      setup(ctx: Context): Promise<(() => Promise<void> | void) | void> | (() => Promise<void> | void) | void
    }
    export function define<T extends Definition>(plugin: T): T
  }
}
