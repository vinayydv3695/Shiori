# Privacy Policy for Shiori

**Last Updated:** October 8, 2026  
**Effective Date:** October 8, 2026  
**Product Name:** Shiori  
**Package Identifier:** `io.github.vinayydv3695.shiori`  
**Repository:** [https://github.com/vinayydv3695/Shiori](https://github.com/vinayydv3695/Shiori)  
**Developer / Publisher:** Vinay Yadav & Shiori Contributors  

---

## 1. Overview & Core Philosophy

**Shiori** is an open-source, local-first manga and eBook reader and library manager built with Tauri, Rust, and React. 

Your privacy is a fundamental priority. **Shiori is designed from the ground up to operate offline and locally by default.** We do not track, collect, monetize, or profile your personal information. We do not operate any centralized tracking or analytics servers.

---

## 2. Information We Do NOT Collect

We believe your reading habits, personal library, and reading history are strictly private to you. Accordingly:

- **No Analytics or Telemetry:** Shiori contains no third-party tracking SDKs, analytics frameworks (such as Google Analytics or Firebase), advertising networks, or user behavior tracking.
- **No Account Required:** You do not need to create an account or provide any personal details (such as name, email address, phone number, or payment details) to use Shiori.
- **No Developer Servers:** There are no developer-hosted backend servers collecting data from Shiori installations.

---

## 3. Information Stored Locally on Your Device

All library data and reading activity remain entirely on your local device. This includes:

- **Library Content:** Books, manga, light novels, and documents imported into Shiori (e.g., EPUB, PDF, MOBI, CBZ, CBR, FB2, TXT).
- **Metadata & Progress:** Titles, author names, genres, tags, reading percentages, current page positions, and reading session durations.
- **User Annotations:** Bookmarks, text highlights, notes, and quotes created within the reader.
- **Preferences & Configuration:** Theme options, font sizes, reader layout choices, and custom keybindings.

This information is saved locally in an SQLite database and local application storage directories managed by your operating system. It is never transmitted to us or any unauthorized third party.

---

## 4. Optional Third-Party Services & Network Usage

Shiori includes optional, user-initiated features that connect to third-party services. These connections only occur when you explicitly configure and enable them. All authentication credentials (such as API keys and OAuth tokens) are stored locally on your device:

1. **AniList Integration (Tracker Sync):**
   - *Purpose:* Allows you to synchronize your reading progress with your personal AniList account.
   - *Data Transmitted:* Manga IDs, chapter numbers, and status updates sent directly to AniList’s GraphQL API (`graphql.anilist.co`).
   - *Credentials:* OAuth tokens are stored locally on your device.

2. **Torbox Integration:**
   - *Purpose:* Optional cloud storage / downloader integration.
   - *Data Transmitted:* User-provided API keys and file requests communicate directly with Torbox servers.

3. **AI Reading Assistants (OpenAI, Anthropic, Ollama, etc.):**
   - *Purpose:* Optional AI-powered book summaries, word definitions, or translations.
   - *Data Transmitted:* Only the specific text snippet you highlight or select is transmitted directly to the configured AI provider endpoint (or to `localhost` if using local models such as Ollama).
   - *Credentials:* Your API keys are stored locally on your device and are never shared.

4. **WebDAV / Remote Sync:**
   - *Purpose:* Optional user-managed remote backups and library synchronization.
   - *Data Transmitted:* Library database snapshots and sync metadata are sent directly to your configured WebDAV server.

5. **Discord Rich Presence:**
   - *Purpose:* Displays your currently reading title and progress in Discord desktop status.
   - *Data Transmitted:* Title and reading progress are communicated locally to your running Discord desktop client via local IPC.

6. **Edge Text-to-Speech (TTS):**
   - *Purpose:* Provides audio narration for book text.
   - *Data Transmitted:* Book text excerpts are transmitted to Microsoft Edge TTS endpoints for audio synthesis.

7. **Online Sources & Plugins:**
   - *Purpose:* Browsing and downloading content from online manga and novel providers.
   - *Data Transmitted:* Search queries and chapter fetch requests communicate directly with the third-party content providers.

8. **Application Update Checks:**
   - *Purpose:* Checking if a newer version of Shiori is available.
   - *Data Transmitted:* Shiori queries the public GitHub Releases API (`api.github.com/repos/vinayydv3695/Shiori/releases`). No personal user data is transmitted.

Each third-party service operates under its own respective privacy policy and terms of service.

---

## 5. Device Permissions

Depending on your platform (Windows, Linux, macOS, or Android), Shiori may request the following permissions:

- **File System Access / Storage:** Required solely to open, import, convert, and organize your eBooks and manga files, and to maintain the local database and caches.
- **Internet / Network Access:** Required for downloading content from online sources (when requested by the user), synchronizing with user-configured third-party accounts, streaming TTS audio, and checking for app updates.

Shiori does not request access to your location, camera, microphone, contacts, or calendar.

---

## 6. Data Retention and Deletion

Because all your data is stored locally:
- You have complete control over your data at all times.
- You can delete individual books, wipe reading history, or reset application settings directly from within the application.
- Uninstalling Shiori and removing its local application data folder will completely and permanently erase all data, caches, and databases from your device.

---

## 7. Children’s Privacy (COPPA)

Shiori does not knowingly collect, store, or solicit personal information from children under the age of 13 (or under 16 in the European Union). Because Shiori collects no personal information from any user, it is compliant with the Children's Online Privacy Protection Act (COPPA) and the General Data Protection Regulation (GDPR).

---

## 8. Open Source Transparency

Shiori is free and open-source software distributed under the GNU General Public License v3.0 (GPL-3.0). The complete source code is publicly accessible and auditable at:  
[https://github.com/vinayydv3695/Shiori](https://github.com/vinayydv3695/Shiori)

Anyone can independently verify that Shiori does not contain tracking code, spyware, or unauthorized data transmission mechanisms.

---

## 9. Changes to This Privacy Policy

We may update this Privacy Policy from time to time to reflect new features or platform requirements. Any changes will be posted in this file within the repository, with an updated "Last Updated" date at the top of the document.

---

## 10. Contact Us

If you have any questions, concerns, or feedback regarding this Privacy Policy or Shiori’s privacy practices, please contact us via:

- **GitHub Issues:** [https://github.com/vinayydv3695/Shiori/issues](https://github.com/vinayydv3695/Shiori/issues)
- **GitHub Discussions / Repository:** [https://github.com/vinayydv3695/Shiori](https://github.com/vinayydv3695/Shiori)
