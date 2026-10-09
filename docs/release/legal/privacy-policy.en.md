> **Internal note (not shown on the site).** Source of truth: [data-inventory.md](data-inventory.md). Placeholders filled and open items resolved on 2026-10-05; this is the published version. Not reviewed by a lawyer — update this file first if facts change (server move, offsite backups, age check).

# Kkumteul Privacy Policy

UniPort (Representative: Ko Yunseo; "we") operates Kkumteul (꿈틀; desktop and mobile apps, the "Service") and processes personal information in accordance with the Personal Information Protection Act of the Republic of Korea ("PIPA").

- Effective date: 2026-10-10
- The Korean version governs if the two versions differ.
- The Service is **free** and uses **no advertising, analytics or tracking tools**.

## 1. Purposes
1. **Account management** — sign-up, sign-in (email/password, Google, Apple), keeping you signed in, preventing abuse (sign-in attempt limits), account deletion.
2. **Providing the Service** — storing your tasks, events, notes, journal and growth records and syncing them across your devices.
3. **AI features** — assistant, inbox auto-sorting, work map, auto-tagging, journal conversation, weekly goal drafts and weekly reports, and enforcing usage limits.
4. **Notifications** — task reminders, daily summary, growth updates and sync signals (Android push).

## 2. What we process and how

| Category | Items | How |
|---|---|---|
| Required — email sign-up | Email address, password (stored only as a one-way hash) | Sign-up screen |
| Required — Google/Apple sign-in | Provider user ID, email address (may be an Apple "Hide My Email" address). **We do not store your name or profile photo.** For Apple sign-in we keep the refresh token Apple issues, only so we can ask Apple to revoke it when you delete your account or unlink Apple. | Returned after you sign in with Google/Apple directly |
| Required — use of the Service | Content you create: tasks (title, notes, dates, repeat, reminders), lists/folders/tags/filters, events (title, notes, location, time), notes/links/wiki, journal (text, mood, conversation with the AI, summary), growth records (XP, character, personality-quiz answers, weekly goals, reports), work map, settings | Your input, sync |
| Generated | Account ID, sign-up time, sign-in sessions (token hash and expiry) | While using the Service |
| Generated — AI | **Counts only**: requests, failures, tokens and processing time per AI feature per day | When you use AI |
| Optional — push (Android) | App-generated device ID, Firebase push token, platform, app version, time zone, locale, notification settings, last seen time | When you allow notifications |

- Stored **only on your device**, never sent to our server: sign-in tokens (device secure storage), events and calendar names read from Google Calendar / macOS Calendar / your phone's calendars (events created elsewhere) and their connection tokens, AI assistant chat history, Mac widget data, tokens for importing from other services.
- **IP addresses** are used only in server memory for sign-in rate limiting (at most 24 hours, cleared on restart). We **do not keep access logs**. Tailscale, which relays connections to our server, can see connection metadata such as IP address and time while relaying (Sections 5 and 6).
- We do not collect sensitive information or national ID numbers. You may choose to write about health or mood in your journal — please write only what you are comfortable storing.
- If you enter other people's names or import a messenger chat export, that text is stored as your content. Please include only what is necessary.

## 3. Retention

| Data | Retention |
|---|---|
| Account (email, password hash, Google/Apple IDs) | Until you delete your account; a Google/Apple link is deleted as soon as you unlink it |
| Your content | Until you delete it or your account |
| Sign-in sessions | Deleted on sign-out/account deletion; expire 60 days after creation and can no longer be used (only a hash of the token is stored) |
| AI usage counts | Until you delete your account (numbers only, no text) |
| Push device info | Deleted on sign-out, when notifications are turned off, on account deletion, or when the push token becomes invalid. Devices not seen for 30 days receive no notifications |
| Notification send log (no titles — type, task ID, time) | 7 days |
| Backups | Daily backups are kept **14 days** and then deleted automatically. Data of deleted accounts may remain in backups during this period and is used only for disaster recovery; if a backup is restored, deleted accounts are deleted again |

## 4. Disclosure to third parties
We **do not** provide your personal information to third parties, except with your consent or where required by law.

## 5. Processors

| Processor | Task |
|---|---|
| Google LLC (Firebase Cloud Messaging) | Delivering push notifications to Android devices |
| Tailscale Inc. | Relaying encrypted connections to our server (decrypted only on our server) |

## 6. International transfers
Our server and AI run on **a computer owned by the operator in the Republic of Korea**. The following transfers are necessary to provide the Service (PIPA Art. 28-8(1)(3)):

| Recipient | Country | Items | When / how | Purpose | Retention |
|---|---|---|---|---|---|
| Google LLC (https://policies.google.com/privacy) | USA and other Google data-center locations | Push token, notification content (task title, time, list name, task ID) | Over the network each time a notification is sent | Push delivery | As needed for delivery, per Google's policy |
| Tailscale Inc. (https://tailscale.com/privacy-policy) | Canada / USA | Connection metadata such as IP (content encrypted) | When you connect | Connection relay | Per Tailscale's policy |

- To keep task titles out of notifications, turn on **Settings › Sounds & Notifications › Hide titles in notifications**. Titles and list names are then not included in notification data at all. You can also disable notifications; reminders already scheduled on your device still work.
- iOS currently uses on-device notifications only (no server push).
- **Google/Apple sign-in** and **Google Calendar** are connections you make directly with those companies. We receive only the sign-in result (ID and email); events read from Google Calendar stay on your device. Events you create or edit in Kkumteul are saved and synced as Kkumteul events and are also saved to the Google or Apple calendar you chose.
- **Phone calendars** (mobile app): we ask for calendar access (iOS full calendar access, Android calendar read/write) only when you tap connect in Settings › Calendar connections. Events, calendar names and colors from your phone's calendars are read on your phone only to show them in the app, and are never sent to our server or to AI. Only events you create in Kkumteul and choose to also save to a phone calendar are stored and synced as Kkumteul events, with only an unreadable code for which calendar it is (no calendar names or emails). Disconnecting hides your phone calendar events in Kkumteul; events in your phone calendar are not deleted.

## 7. AI and your data
1. All AI features run on **an AI model hosted on the operator's own computer**. Your text is **not sent to third-party AI providers** (such as OpenAI, Google or Anthropic).
2. Only what a feature needs is sent (e.g. a note to sort, task titles and list names, the tasks, events and notes the AI assistant looks up to answer your question, the day's journal text when journal conversation is on and the entry is not "private", and journal text when you turn on journal access for the AI assistant). **Calendar events from Google/Apple or your phone's calendars are never sent to AI.**
3. The server **does not store or log AI request or response text**; it keeps only usage counts to enforce limits.
4. AI output you keep in the app (journal conversation and summary, weekly reports, sorting/tag results) is stored and synced as your content under Section 3.
5. AI output is an automated suggestion and may be wrong. Auto-sorting and auto-tagging are not automated decisions with significant effects on your rights; you can change or undo them at any time.
6. We do not use your data to train AI models.

### Google API Services — Limited Use
Kkumteul's use of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements. Google Calendar data is used only to display your events in the app on your device and to save events you create or edit in Kkumteul to your own Google Calendar. Events received from Google Calendar are not sent to our server (events you create in Kkumteul are synced as Kkumteul events), not used for AI, not used for advertising, and not transferred to anyone.

## 8. Deletion
- When you delete your account in the app, your account, all content, sessions, Google/Apple links, push device info and AI usage counts are deleted **immediately in one step** and removed from your other devices. Copies in backups are deleted after 14 days.
- Electronic records are deleted from the database so they cannot be restored; backup files are deleted as whole files. We keep no paper records.

## 9. Your rights
You may request access, correction, deletion or suspension of processing, and withdraw consent (delete your account) at any time.
- Content: edit or delete in the app.
- Account deletion: desktop **Settings › Account › Delete Account**; mobile **More › Settings › Account › Delete Account** (see [Account deletion](account-deletion.en.md)).
- Other requests, or if you cannot use the app: email the privacy officer below. We respond within **10 days** after verifying your identity. You may act through a representative with a power of attorney.

## 10. Security measures
- All traffic between the apps and our server is encrypted (HTTPS/TLS).
- Passwords and session tokens are stored only as one-way hashes (scrypt / SHA-256).
- Sign-in tokens on devices are kept in OS secure storage (Keychain, DPAPI, Android Keystore).
- The server enforces that each user can access only their own data.
- Rate limits on sign-in, sign-up and account-deletion confirmation.
- Database and AI are not exposed to the internet.
- Server logs do not contain emails, task titles or AI text.
- **Current limitation:** content such as journal entries is stored on the server without end-to-end encryption, so the operator can technically access it. The operator does not access it except when needed (e.g. to resolve a failure).
- Only the representative handles personal information, and the server computer is kept in a location the operator manages directly.

## 11. Cookies and tracking
We use **no cookies, advertising IDs, analytics or crash-reporting tools**, show no ads and do not track you.

## 12. Children
The Service is for users **aged 14 or older**. We do not knowingly collect information from children under 14 and will delete such accounts when we become aware of them.

## 13. Privacy officer
- Name: Ko Yunseo (Representative, UniPort)
- Email: kysk2295@naver.com

## 14. Remedies (Korea)
Personal Information Dispute Mediation Committee 1833-6972 (www.kopico.go.kr) · Personal Information Infringement Report Center 118 (privacy.kisa.or.kr) · Supreme Prosecutors' Office 1301 · Korean National Police Agency 182.

## 15. Changes
We announce changes in the app or on our website at least **7 days** before they take effect (**30 days** for material or unfavorable changes).
- Announced: 2026-10-10 / Effective: 2026-10-10
- History: 2026-10-10 revision — added what the AI assistant looks up to answer (tasks, events, notes, and diary if enabled) · 2026-10-06 first version
