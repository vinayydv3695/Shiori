/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ANILIST_DESKTOP_CLIENT_ID: string
  readonly VITE_ANILIST_ANDROID_CLIENT_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
