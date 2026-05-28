#!/bin/bash
git add src-tauri/src/commands/discord.rs src-tauri/src/services/discord_service.rs src/hooks/useDiscordPresence.ts src/components/settings/SettingsDialog.tsx
git commit -m "feat(discord): add Discord rich presence integration"

git add src-tauri/src/sources/annas_archive.rs src-tauri/src/sources/nyaa.rs src-tauri/src/sources/weebrook.rs src-tauri/src/sources/mod.rs src-tauri/src/sources/registry.rs src-tauri/src/commands/sources.rs src/store/sourceStore.ts src/components/settings/SourceManager.tsx
git commit -m "feat(sources): add Anna's Archive, Weebrook and improve Nyaa with mirror failovers"

git rm src-tauri/src/sources/bitsearch.rs src-tauri/src/sources/rutracker.rs src-tauri/src/sources/tpb_api.rs src-tauri/src/sources/x1337.rs src/components/settings/AnnaArchiveSettings.tsx src/components/settings/RuTrackerSettings.tsx
git commit -m "refactor(sources): remove deprecated torrent sources and settings components"

git add src/components/TorboxControlCenter.tsx src/components/torbox/ src/components/online/
git commit -m "feat(ui): redesign Torbox Control Center and integrate direct downloads modal"

git add src/components/home/ src/components/statistics/ src/online-books/
git commit -m "feat(ui): add new home widgets, activity heatmap and online books integration"

git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/gen/
git commit -m "chore: bump version to 1.1.0 and update schemas"

git add .
git commit -m "chore: misc updates and structural improvements"

