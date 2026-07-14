# Karea Mobile (Operator)

Expo React Native field app for `OPERATOR` accounts.

## Run

```bash
cp .env.example .env   # if needed
npm install
npm start
```

Then open in iOS Simulator, Android emulator, or Expo Go.

## API base URL

Set `EXPO_PUBLIC_API_BASE_URL` in `.env` (loaded automatically by Expo SDK 49+).

| Environment | Typical value |
|---|---|
| iOS Simulator | `http://localhost:8080/api/v1` |
| Android emulator | `http://10.0.2.2:8080/api/v1` (maps to host loopback) |
| Physical device (same LAN) | `http://<your-machine-LAN-IP>:8080/api/v1` |

Do **not** use `localhost` on a physical phone — that points at the device itself, not your laptop. Find your LAN IP (`ipconfig` / `ifconfig`) and put it in `.env`. The app does not auto-detect this.

CORS (`CORS_ALLOWED_ORIGIN`) only applies to browsers; React Native `fetch` is not subject to CORS.

## Seed login

`operator.one@karea.local` / `changeme123` (see `/database/seed`).
