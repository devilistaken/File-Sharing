# PRD: Fuse (one-off file transfer)

**Problem statement:** PS2, File-Sharing Service
**Variant:** 1, one-off transfer
**Team / author:** _<your name, reg. no.>_
**Version:** 1.0, 28 Oct 2026
**Repo:** _<github link>_

---

## 1. Problem

Most of us send files over WhatsApp, email or a Drive link and never think about them again. The copy stays in someone's inbox, and a Drive link set to "anyone with the link" keeps working until somebody remembers to switch it off. That is fine for a holiday photo. It is not fine for a marksheet, an ID scan or a signed form that only needed to reach one person once.

Fuse is built around the opposite idea: **a file should have a lifespan.** The owner uploads a file, decides how long the link lives and how many times it can be downloaded, and shares it. When either limit is hit, the file is deleted from the server, not just hidden.

The problem statement also says nothing uploaded should be able to harm the service or the people who open it. So we treat every upload as hostile by default, and that shapes a lot of the design below.

## 2. Use cases and impact

This is not meant to be a CRUD app with a file field. The point is the lifecycle: upload, share, burn out.

| Who | Situation | What they set | Why Fuse helps |
|---|---|---|---|
| Student | Sends a certificate scan to an HR team for verification | 1 download, 24 hours | The scan is gone once HR has it. No leftover copy on a shared link. |
| Freelancer | Sends a draft design to a client before payment | 3 days, no download limit | Can revoke the link at any time if things go wrong. |
| Lab partner | Shares a dataset with someone who has no account | 7 days | Recipient just opens a link. No sign-up, no app install. |
| Anyone | Sends something private to a friend | 1 hour, 1 download | The link is useless to anyone who finds it later. |

**Impact we are aiming for**

- Fewer forgotten copies of sensitive documents floating around.
- The owner stays in control after sending (revoke, delete, see how many times it was opened).
- Recipients need nothing. Most will open the link on a phone, so the download page has to work well on small screens.
- Server storage stays small because dead files are purged automatically.

**Not in scope for v1:** long-term storage, folders, previews, end-to-end encryption, virus scanning, password-protected links, email notifications.

## 3. Userbase

| Role | Logged in? | Can do |
|---|---|---|
| Owner | Yes | Register, log in, upload, set expiry and download limit, see dashboard and download counts, copy link, revoke, delete |
| Recipient | No | Open a link, see file name, size and time left, download. If the link is dead, see why. |

Expected scale is a class project, so tens of users, not thousands. We still pick limits as if storage matters: 50 MB per user means 100 users can use at most about 5 GB, and the cleanup job keeps the real number much lower.

## 4. Functional requirements

These map straight to the "must have" list in the problem statement.

| # | Requirement |
|---|---|
| F1 | Owner can register and log in. |
| F2 | Upload with a per-file size limit (10 MB) and a per-user quota (50 MB). |
| F3 | Owner chooses expiry (1 h, 2 h, 24 h, 3 d, 7 d max) and optionally a download limit (1, 3, 5, 10 or none). |
| F4 | Upload returns an unguessable share link. |
| F5 | Download page shows file name, size, live countdown and downloads left, with a download button. |
| F6 | Dashboard lists the owner's files with status, download count and time remaining. |
| F7 | Owner can revoke a link (file removed, link shows "revoked") or delete a file completely. |
| F8 | Expired, revoked and used-up links show clear, different messages. |
| F9 | Expired, revoked and used-up files are removed from disk automatically. |
| F10 | Dangerous file types are rejected at upload. |

## 5. Authentication and authorization

**Authentication (who are you)**

- Email and password. Passwords are hashed with bcrypt (cost 12), never stored or logged in plain text.
- On login or register the server returns a JWT (7 day expiry, payload is just the user id). The frontend keeps it in `localStorage` and sends it as `Authorization: Bearer <token>`.
- Login failures always say "Incorrect email or password" whether the email exists or not, and the server runs a dummy bcrypt compare for unknown emails so response time does not give it away.
- Minimum password length is 8.

**Authorization (what are you allowed to do)**

- Owner routes (`/api/files/...`) need a valid JWT.
- Every file lookup for revoke or delete includes the owner id in the query: `File.findOne({ _id, owner: req.user._id })`. So user B asking for user A's file gets a 404, the same as a file that does not exist. We do not leak that it exists.
- Recipients have no account. The share token is the permission: whoever holds the token can download until the limits run out. That is why the token has to be unguessable (section 6).

## 6. Attack prevention

| Threat | What we do |
|---|---|
| Stored XSS via uploaded HTML or SVG | Block `.html`, `.svg`, `.js` etc. by extension and by MIME type. Also read the first 1 KB of the file and reject it if it starts with `<html`, `<svg`, `<script` and similar, so renaming `page.html` to `page.txt` does not work. |
| Browser rendering an upload | Downloads are always sent with `Content-Disposition: attachment`, `Content-Type: application/octet-stream`, `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`. |
| Path traversal through file names | The name on disk is a random UUID. The original name is only stored in the database (with slashes and control characters stripped) and used in the download header. |
| Uploads reachable as static files | Upload folder sits outside `public/`. The only way to a file is the download route. |
| Guessing share links | Tokens are 24 random bytes (192 bits, base64url). The share routes are rate limited and the token format is checked before any database query. |
| Brute-forcing login | Rate limit on login and register, bcrypt cost 12, generic error message. |
| Two people grabbing the last download | The download counter is incremented in one atomic `findOneAndUpdate` that also checks the limits, so only one request can win the last slot. |
| Link-preview bots (WhatsApp, Slack) burning a one-time link | The page that shows file info (`GET /api/share/:token`) does not count as a download. Only the `/download` route does. |
| NoSQL injection | Inputs are converted with `String()` and `Number()` before use, and `express.json` is limited to 10 KB. |
| Oversized uploads / disk filling | multer enforces 10 MB, one file per request, and the quota is checked before the record is saved. Rejected uploads are deleted from disk straight away. |
| Clickjacking, mixed content, other header issues | Helmet with a CSP: scripts from self only (plus two tiny inline scripts), fonts only from Google Fonts, `frame-ancestors 'none'`. |
| XSS through file names on the dashboard | The frontend builds the DOM with `textContent`, never `innerHTML` with user data. |
| Leftover files after a crash or failed delete | The cleanup job retries every 60 seconds and picks up anything still marked as not purged. |

**Things we accept and do not solve in v1:** no antivirus scan (a malicious `.pdf` or `.docx` can still be uploaded, the recipient is responsible for opening it carefully), and the JWT sits in `localStorage`, which is exposed if an XSS bug ever gets through. The CSP and `textContent` rule reduce that risk but do not remove it.

## 7. Architecture

```
 Browser (HTML / CSS / vanilla JS)
   |  JSON over fetch, multipart for upload
   v
 Express app  ── helmet, rate limits, JWT middleware
   |        \
   |         \__ routes/auth    register, login, me
   |             routes/files   list, upload, revoke, delete   (owner only)
   |             routes/share   link info, download            (public)
   |
   +──> MongoDB   users, files (metadata, limits, counters, token)
   |
   +──> uploads/  the actual bytes, named by random UUID
   |
   +──> cleanup job (every 60 s) deletes dead files from uploads/
```

**Upload flow**

1. Browser checks size and extension, then POSTs multipart to `/api/files` (progress bar uses XHR).
2. multer streams the file to `uploads/<uuid>`, rejecting bad extensions or MIME types on the way.
3. Server validates expiry and download limit, sniffs the first bytes, checks the quota.
4. A `File` record is created with a random token. Response contains the file object, frontend builds the link.
5. If any step fails, the temp file is deleted before the error is returned.

**Download flow**

1. Recipient opens `download.html?token=...` (or `/s/<token>`). Page calls `GET /api/share/:token`.
2. 200 means show file info and countdown. 404 or 410 means show the matching message.
3. Clicking download hits `GET /api/share/:token/download`. The server atomically increments the counter, streams the file, and if that was the last allowed download, deletes it when the response closes.

**Link status** is worked out in one place (`utils/files.js`) in this order: revoked, then consumed (download limit reached), then expired (time passed or file purged), otherwise active.

## 8. Frontend plan

Plain HTML, CSS and JavaScript. No framework, no build step. Express serves the `public/` folder.

| Page | Purpose |
|---|---|
| `index.html` | Landing page, explains the idea, links to sign up and log in |
| `register.html`, `login.html` | Forms, client-side validation, shared `auth.js` |
| `dashboard.html` | Storage meter, upload box, link output, file list |
| `download.html` | Public recipient page with all the dead-link states |

Scripts: `utils.js` (DOM helper, formatting, toast, countdown), `api.js` (every fetch call and the token), then one script per page.

Plan and decisions:

- **Mobile first.** Layout uses CSS grid and flexbox and collapses to one column under about 880 px.
- **The "fuse bar".** A thin bar that shrinks as time runs out, on both the dashboard and the download page. One timer function drives all countdowns on a page.
- **Client checks are for convenience only.** File size, blocked extensions and quota are checked in the browser to save an upload, but the server repeats every check.
- **Every failure has a message.** Network down, 401 (redirect to login), 413, 429 and the four dead-link states all end up as readable text, not a blank page.
- **Accessibility basics.** Labels on every input, visible focus outline, keyboard-operable drop zone, `aria-live` on status areas, `prefers-reduced-motion` respected.

## 9. Backend plan

Node.js with Express, Mongoose for MongoDB.

```
server.js          app setup, helmet, static files, error handler
config.js          all limits in one place
models/            User.js, File.js
routes/            auth.js, files.js, share.js
middleware/auth.js JWT check
utils/files.js     status logic, serialize, purge, quota
utils/cleanup.js   background purge job
```

Decisions worth knowing:

- **All limits live in `config.js`** (file size, quota, max expiry, blocked types). Nothing is hard-coded in routes.
- **Quota counts only files still on disk.** Once a file is purged, the space is free again.
- **Revoking deletes the file immediately.** A revoked link will never serve again, so there is no reason to keep the bytes.
- **Errors use one shape:** `{ "message": "..." }`, plus `"status": "expired" | "revoked" | "consumed" | "notfound"` on share routes so the frontend can pick the right page.
- **Status codes:** 404 for a token that does not exist, 410 for one that did exist but is dead.

## 10. API and rate limits

Everything is JSON except upload (multipart) and download (file stream).

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | none | `{ name, email, password }` returns `{ token, user }` |
| POST | `/api/auth/login` | none | `{ email, password }` returns `{ token, user }` |
| GET | `/api/auth/me` | JWT | current user |
| GET | `/api/files` | JWT | `{ files, quota: { used, limit }, maxFileSize }` |
| POST | `/api/files` | JWT | multipart: `expiresInHours`, `maxDownloads`, `file` |
| POST | `/api/files/:id/revoke` | JWT | owner only |
| DELETE | `/api/files/:id` | JWT | owner only |
| GET | `/api/share/:token` | none | file info, or 404 / 410 with `status` |
| GET | `/api/share/:token/download` | none | file stream |

**Rate limits (per IP)**

| Routes | Limit | Why |
|---|---|---|
| `/api/auth/register`, `/api/auth/login` | 30 requests per 15 minutes (shared counter) | slows password guessing |
| `/api/share/*` | 60 requests per minute (shared counter) | slows token guessing and download hammering |

Going over a limit returns `429` with a readable message. Upload has no separate rate limit; it is already bounded by login, the 10 MB limit and the 50 MB quota. If we deploy behind a proxy we need `trust proxy` set, otherwise every user looks like the same IP.

## 11. Database

MongoDB, two collections.

**users**

| Field | Type | Notes |
|---|---|---|
| name | String | 2 to 80 chars |
| email | String | unique, lowercase |
| passwordHash | String | bcrypt |
| createdAt, updatedAt | Date | automatic |

**files**

| Field | Type | Notes |
|---|---|---|
| owner | ObjectId | indexed, ref users |
| originalName | String | sanitised, used for the download header |
| storedName | String | random UUID, the name on disk |
| size | Number | bytes |
| mimeType | String | as sent by the browser, not trusted |
| token | String | unique, 192-bit random |
| expiresAt | Date | indexed |
| maxDownloads | Number | 0 means no limit |
| downloadCount | Number | |
| revoked | Boolean | |
| purged | Boolean | true once the bytes are deleted |

We keep the record after a file is purged so the owner still sees "expired" or "revoked" in the dashboard and recipients still get the right message. Only the bytes are removed.

**Authorization at the data layer:** every owner query includes `owner`. There is no route that fetches or changes a file by id alone.

## 12. Tech stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | HTML, CSS, vanilla JS (DOM, fetch, JSON) | what the course covers, no tooling needed |
| Server | Node.js 18+ with Express | same |
| Database | MongoDB with Mongoose | same |
| Auth | bcryptjs, jsonwebtoken | simple, well known |
| Uploads | multer (disk storage) | streams to disk, size limits built in |
| Security | helmet, express-rate-limit | headers and rate limiting without writing our own |
| Version control | Git and GitHub | branching and PRs for the team |

## 13. Methodology

Small iterations, matching the way the course is paced, with a working demo at the end of each one.

| Step | Goal | Done when |
|---|---|---|
| 1. Static pages | Landing, auth and dashboard layouts, responsive | Pages look right on phone and laptop |
| 2. Frontend logic | Forms, validation, drop zone, countdowns against mock data | UI works without a backend |
| 3. API | Express routes for auth, upload, share, download | Postman collection passes |
| 4. Database | Mongoose models, quota, status logic | Data survives a server restart |
| 5. Hardening and demo | Rate limits, upload checks, cleanup job, tests | Attack checklist in section 6 verified |

Git: `main` always runs. Work happens on short feature branches (`feat/upload`, `fix/quota`) and merges by pull request with at least one review. Commit messages say what changed, not "update".

## 14. Tests and E2E

Honest status: the test suite is **planned, not written yet**. This is the list we will build from.

**API tests** (Jest + Supertest + an in-memory MongoDB)

- Register: valid, duplicate email, short password.
- Login: correct, wrong password, unknown email (same message for both).
- Upload without a token is rejected.
- Upload over 10 MB is rejected with 413.
- Upload that would pass the 50 MB quota is rejected and nothing is left on disk.
- Upload `.html`, `.svg`, and an HTML file renamed to `.txt` are all rejected.
- Invalid expiry or download limit is rejected.
- User B cannot revoke or delete user A's file (gets 404).
- Share info for a missing token gives 404. Expired, revoked and used-up each give 410 with the right `status`.
- Two parallel downloads of a 1-download link: exactly one succeeds.
- Download response has `attachment`, `octet-stream` and `nosniff` headers.
- Cleanup job removes an expired file from disk.
- 31st login attempt in 15 minutes gets 429.

**End-to-end tests** (Playwright, real browser against a test database)

1. Register, upload a small file, copy the link.
2. Open the link in a fresh browser context (no login), see the file info, download it.
3. Same flow with "1 download": a second visit shows the "self-destructed" message.
4. Set `expiresAt` to the past in the test database: link shows "expired".
5. Revoke from the dashboard: link shows "revoked", file is gone from `uploads/`.
6. Try to upload a `.svg`: the error message appears and nothing is saved.
7. Fill the quota: the next upload shows the "not enough storage" message.
8. Dashboard and download page render without horizontal scroll at 375 px width.

**Manual checks before the demo:** one real phone, one slow network, Postman collection run.

## 15. Environment definition

| Thing | Value |
|---|---|
| Node.js | 18 or newer (developed on 22) |
| MongoDB | local install or Atlas free tier |
| Package manager | npm |
| OS | any; no OS-specific code |

**Environment variables** (`.env`, never committed; `.env.example` is committed)

| Variable | Required | Meaning |
|---|---|---|
| `PORT` | no | default 3000 |
| `MONGO_URI` | yes in production | default `mongodb://127.0.0.1:27017/fuse` |
| `JWT_SECRET` | yes in production | long random string; the app refuses to start in production without it |
| `NODE_ENV` | no | set to `production` when deployed |

**Run locally**

```
cp .env.example .env     # then set JWT_SECRET
npm install
npm start                # http://localhost:3000
```

Open the site through `localhost:3000`, not by double-clicking the HTML files, because the API lives on the same server.

## 16. Deployment (optional)

Not required for marking, but the plan is simple.

- **App:** Render or Railway as a Node web service, start command `npm start`.
- **Database:** MongoDB Atlas free cluster, connection string in `MONGO_URI`.
- **Secrets:** set `JWT_SECRET` and `NODE_ENV=production` in the host's dashboard.
- **Proxy:** uncomment `app.set('trust proxy', 1)` in `server.js` so rate limiting sees real IPs.
- **HTTPS:** provided by the host. Do not serve this over plain http in production, since the JWT travels in a header.
- **Disk caveat:** most free hosts wipe the disk on redeploy. For this app that is mostly harmless because files are short-lived anyway. If the bytes are gone but the record exists, the download route notices, marks it purged and shows "expired". A paid host with a persistent disk, or object storage like S3, would be the next step.

## 17. Agent instructions

For anyone (or any AI coding assistant) changing this repo. Read these before editing.

1. **Never use `innerHTML` with anything that came from a user or the API.** Use `textContent` or the `h()` helper in `utils.js`. The only `innerHTML` allowed is the hard-coded icon in `download.js`.
2. **Every query that touches a file on behalf of an owner must include `owner: req.user._id`.** No lookups by id alone on owner routes.
3. **Limits live in `config.js`.** Do not hard-code 10 MB, 50 MB, 7 days or the blocked-type list anywhere else. The frontend reads `maxFileSize` and quota from the API.
4. **Do not serve `uploads/` statically, and do not move it inside `public/`.**
5. **Downloads must keep the safe headers:** attachment, octet-stream, nosniff, sandbox CSP.
6. **Keep the download counter atomic.** Do not replace the `findOneAndUpdate` with a read followed by a write.
7. **Do not weaken the login error message** or add anything that reveals whether an email exists on the login route.
8. **Keep the API shapes in section 10 stable.** If you change a response, update `public/js/api.js`, the pages that use it, and this document in the same commit.
9. **Add or update a test for every bug fix and every new rule.** Run the test suite before opening a PR.
10. **No new dependency without a one-line reason in the PR.** The stack is deliberately small.
11. **Never commit `.env` or anything in `uploads/`.**
12. When unsure whether something is a security change, treat it as one and ask for review.

## 18. Known gaps and future work

- No email verification and no password reset.
- No antivirus scanning of uploads (ClamAV would be the first thing to add).
- Logout only clears the browser's token. A stolen JWT stays valid until it expires (7 days). A token blacklist or short-lived tokens with refresh would fix this.
- The user-exists check on register tells an attacker which emails have accounts. Acceptable for a class project, not for production.
- Download counter counts started downloads, not completed ones. A dropped connection on a one-time link still uses it up. Chosen on purpose: safer to burn a link than to allow replays.
- No password-protected links and no end-to-end encryption. Both would be good next features.