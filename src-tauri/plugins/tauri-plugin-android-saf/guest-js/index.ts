import { invoke } from '@tauri-apps/api/core'

export async function selectFolder(): Promise<string> {
  const response = await invoke<{uri: string}>('plugin:android-saf|select_folder')
  return response.uri
}
