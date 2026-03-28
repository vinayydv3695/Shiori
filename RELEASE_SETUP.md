# Multi-Platform Release Setup Summary

## Overview
Shiori eBook Manager now has automated builds for all major platforms via GitHub Actions.

## GitHub Actions Workflows Created

### 1. Main Release Workflow (`release.yml`)
**Triggers**: On git tags `v*` or manual dispatch

**Builds**:
- **Linux** (Ubuntu 22.04)
  - AppImage (portable)
  - .tar.gz (for AUR bin package)
  - Native Tauri bundles (.deb)
  
- **Windows** (latest)
  - .exe installer
  - .msi installer
  - Portable executable
  
- **macOS** (latest)
  - .dmg installer
  - .app bundle
  - Universal binary (Intel + Apple Silicon)

**Process**:
1. Creates GitHub release (draft)
2. Builds for all platforms in parallel
3. Uploads all artifacts to release
4. Publishes release (removes draft status)

### 2. Flatpak Workflow (`flatpak.yml`)
**Triggers**: On git tags `v*` or manual dispatch

**Builds**:
- Flatpak bundle for Linux
- Uses Freedesktop SDK 23.08
- Includes all required runtimes

## Package Formats Available

| Platform | Format | Installation Method |
|----------|--------|-------------------|
| **Linux** | AppImage | `chmod +x && ./shiori.AppImage` |
| | .deb | `sudo dpkg -i shiori.deb` |
| | .tar.gz | Extract and run `./shiori` |
| | Flatpak | `flatpak install shiori.flatpak` |
| | AUR (source) | `yay -S shiorii-git` |
| | AUR (binary) | `yay -S shiorii-bin` |
| **Windows** | .exe | Run installer |
| | .msi | Windows Installer |
| **macOS** | .dmg | Drag to Applications |
| | .app | Direct application bundle |

## AUR Packages

### shiorii-git (Source Package)
- **Repository**: https://aur.archlinux.org/packages/shiorii-git
- **Type**: Builds from source
- **Dependencies**: rust, cargo, nodejs, npm, webkit2gtk, sqlite, zstd
- **Build Time**: ~10-15 minutes
- **Status**: ✅ Fixed (added missing sqlite/zstd deps)

Use package files under `aur/shiorii-git` in this repository as the source template.

### shiorii-bin (Binary Package)
- **Repository**: https://aur.archlinux.org/packages/shiorii-bin
- **Type**: Pre-compiled binary
- **Dependencies**: Runtime only (webkit2gtk, gtk3, sqlite, zstd)
- **Install Time**: ~30 seconds
- **Status**: ✅ Created, pending release artifacts

## Release Process

### Automated (Recommended)
```bash
# 1. Update version in package.json and src-tauri/Cargo.toml
# 2. Commit changes
git add -A
git commit -m "chore: bump version to v0.1.6"
git push

# 3. Create and push tag
git tag v0.1.6
git push origin v0.1.6

# 4. GitHub Actions automatically:
#    - Builds all platforms
#    - Creates release
#    - Uploads artifacts
```

### Manual (If needed)
```bash
# Build locally
npm run build

# Artifacts will be in:
# - src-tauri/target/release/bundle/
```

## Post-Release Tasks

After GitHub Actions completes:

1. **Update AUR bin package**:
   ```bash
   cd ~/AUR/shiorii-bin
   # Update PKGBUILD with new version and sha256sum
   makepkg --printsrcinfo > .SRCINFO
   git add PKGBUILD .SRCINFO
   git commit -m "Update to vX.X.X"
   git push
   ```

   Use package files under `aur/shiorii-bin` in this repository as the source template.

2. **Test installations**:
   - Test AUR source: `yay -S shiorii-git`
   - Test AUR binary: `yay -S shiorii-bin`
   - Test AppImage download
   - Test Flatpak install

3. **Announce release**:
   - Update README.md with download links
   - Post on relevant forums/communities
   - Update documentation

## Current Status

✅ **Completed**:
- GitHub Actions workflows created
- Flatpak build configuration
- AUR source package fixed (sqlite/zstd deps)
- AUR binary package created
- Release tag pushed (v0.1.5)

⏳ **In Progress**:
- GitHub Actions building v0.1.5
- Local compilation for testing

⏸️ **Pending**:
- Update AUR bin PKGBUILD after release completes
- Test all package formats
- Generate checksums

## Dependencies by Platform

### Linux Runtime
- webkit2gtk (4.1)
- gtk3
- libayatana-appindicator
- librsvg
- speech-dispatcher (optional, for TTS)
- sqlite
- zstd

### Linux Build
- All runtime deps +
- rust (1.70+)
- cargo
- nodejs (18+)
- npm
- base-devel
- openssl

### Windows
- WebView2 Runtime (auto-installed)

### macOS
- macOS 10.13+ (High Sierra or later)

## Monitoring

- **GitHub Actions**: https://github.com/vinayydv3695/Shiori/actions
- **Releases**: https://github.com/vinayydv3695/Shiori/releases
- **AUR Source**: https://aur.archlinux.org/packages/shiorii-git
- **AUR Binary**: https://aur.archlinux.org/packages/shiorii-bin

## Troubleshooting

### GitHub Actions fails
- Check workflow logs in Actions tab
- Verify all secrets are set (GITHUB_TOKEN is automatic)
- Ensure tag format matches `v*` pattern

### AUR package fails
- Check `.SRCINFO` is up to date: `makepkg --printsrcinfo > .SRCINFO`
- Verify dependencies are available in Arch repos
- Test local build: `makepkg -si`

### Binary package checksum mismatch
- Download artifact from GitHub release
- Generate checksum: `sha256sum Shiori_1.0.0_amd64.AppImage`
- Update `aur/shiorii-bin/PKGBUILD` sha256sums array

## Next Steps

1. **Wait for builds to complete** (~20-30 minutes)
2. **Download and test artifacts**
3. **Update AUR bin package** with proper checksums
4. **Announce v0.1.5 release**
5. **Plan v0.2.0 features**

---

**Last Updated**: 2026-03-09
**Version**: 0.1.5
**Maintainer**: Vinay Kumar <vinayydv343@gmail.com>
