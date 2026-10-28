# One-Off Transfer: backend + website in one project

    npm install
    cp .env.example .env     # set JWT_SECRET; start MongoDB or set an Atlas MONGO_URI
    npm start

Open http://localhost:3000

## How links are created
1. Owner uploads a file: `POST /api/files` (Bearer token).
2. Backend saves it, generates a 64-char random token and returns the file with a `link`:
   `BASE_URL/download.html?t=<token>`
3. The dashboard shows and copies exactly that `link`.
4. The recipient page calls `GET /api/public/:token` (info, not counted) and then
   `GET /d/:token/download` (the real, counted download).

## Making the link work for other people
The link uses BASE_URL from `.env`. localhost only works on your own computer.
- Same Wi-Fi: BASE_URL=http://YOUR-LAPTOP-IP:3000
- Over the internet: run `npx ngrok http 3000` and set BASE_URL to the https URL it prints
  (restart the server after changing .env; links made earlier keep the old address).

## API
| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | /api/auth/register | no | {email,password} -> {token,user} |
| POST | /api/auth/login | no | {email,password} -> {token,user} |
| GET | /api/auth/me | Bearer | current user |
| POST | /api/files | Bearer | multipart: expiresInMinutes, maxDownloads, file -> {file:{..., link}} |
| GET | /api/files | Bearer | list + quota |
| POST | /api/files/:id/revoke | Bearer | revoke |
| DELETE | /api/files/:id | Bearer | delete |
| GET | /api/public/:token | no | recipient info (404 unavailable, 410 revoked/consumed) |
| GET | /d/:token/download | no | counted download |
| GET | /api/health | no | health check |

Frontend hosted elsewhere? Set FRONTEND_URL and CORS_ORIGIN in .env and put the
frontend's js/config.js API_BASE to this server's address.
