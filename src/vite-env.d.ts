/// <reference types="vite/client" />

// Augment ImportMeta to ensure env properties are always available
// This fixes the `import.meta.env ?? {}` pattern in auto-generated client.ts
declare global {
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
    readonly VITE_SUPABASE_FALLBACK_PUBLISHABLE_KEY?: string;
    readonly VITE_SUPABASE_PROJECT_ID?: string;
  }
}

export {};
