# Remember This - Render Deployment

This app is ready to deploy to Render as a Node web service.

## Requirements

- Node.js 18+
- npm

## Local Run

1. Install dependencies:

```bash
npm ci
```

2. Start the server:

```bash
npm start
```

3. Open:

```text
http://localhost:3000
```

## Environment Variables

- `PORT`: Provided automatically by Render.
- `SESSION_SECRET`: Required in production. Use a long random string.
- `DATA_DIR`: Optional local override. On Render, set to `/var/data`.

## Deploy On Render

This repository includes `render.yaml` for one-click blueprint deploy.

1. Push this repository to GitHub.
2. In Render, click `New +` -> `Blueprint`.
3. Select this repository.
4. Render will read `render.yaml` and create:
	- One web service
	- One persistent disk mounted at `/var/data`
	- Required environment variables
5. Deploy.

## Important Data Note

User accounts, chat history, and uploads are stored in `DATA_DIR`.

- Local default: `rah/data`
- Render recommended: `/var/data` (persistent disk)

If you deploy without a persistent disk, your data can be lost on restart/redeploy.

## Admin Setup

- Username `Zammy022` is auto-treated as admin.
- Admins can delete chat messages and manage accounts from the admin page.
