export interface ViewerInfo {
    id: number;
    name: string;
    avatar?: string;
}

export interface AniListAuthProvider {
    login(): Promise<void>;
    logout(): Promise<void>;
    getAccessToken(): Promise<string | null>;
    isAuthenticated(): Promise<boolean>;
    getViewerInfo(): Promise<ViewerInfo | null>;
}
