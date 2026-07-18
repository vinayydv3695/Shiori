import { create } from 'zustand';

export interface UpdateInfo {
  version: string;
  notes: string;
  apkUrl?: string; // For Android
  desktopUpdate?: any; // The Tauri Update object
}

interface UpdateState {
  isChecking: boolean;
  updateInfo: UpdateInfo | null;
  isUpdateDialogOpen: boolean;
  
  setIsChecking: (isChecking: boolean) => void;
  setUpdateInfo: (info: UpdateInfo | null) => void;
  setIsUpdateDialogOpen: (isOpen: boolean) => void;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  isChecking: false,
  updateInfo: null,
  isUpdateDialogOpen: false,
  
  setIsChecking: (isChecking) => set({ isChecking }),
  setUpdateInfo: (updateInfo) => set({ updateInfo }),
  setIsUpdateDialogOpen: (isUpdateDialogOpen) => set({ isUpdateDialogOpen })
}));
