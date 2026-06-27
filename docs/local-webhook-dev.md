# Local webhook development setup

This guide explains how to receive GitHub App webhooks on your local machine
during development without deploying the server.

## Prerequisites

- Node.js 20+
- A GitHub App (see below for creating one)
- One of: [smee.io](https://smee.io) (easiest) or [ngrok](https://ngrok.com)

---

## Option A — smee.io (recommended for quick start)

1. **Create a channel** at https://smee.io — you'll get a URL like
   `https://smee.io/abc123xyz`.

2. **Install the smee client**:
   ```bash
   npm install --global smee-client
   ```

3. **Forward events to your local server**:
   ```bash
   smee --url https://smee.io/abc123xyz --target http://127.0.0.1:3000/api/webhooks
   ```

4. **Set the Webhook URL** in your GitHub App settings to your smee URL.

---

## Option B — ngrok

1. **Install ngrok**: https://ngrok.com/download

2. **Expose your local server**:
   ```bash
   ngrok http 3000
   ```

3. Copy the `https://....ngrok-free.app` URL and set it as your GitHub App's
   Webhook URL, appended with `/api/webhooks`.

---

## Creating a dev GitHub App

1. Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**.
2. Fill in:
   - **GitHub App name**: `JulesOps Dev - <your-username>`
   - **Homepage URL**: `http://localhost:3000`
   - **Webhook URL**: your smee or ngrok URL + `/api/webhooks`
   - **Webhook secret**: any random string (set as `GITHUB_WEBHOOK_SECRET` in `.env`)
3. **Permissions** (Repository):
   - Metadata: Read-only
   - Issues: Read & write
   - Pull requests: Read & write
   - Contents: Read-only
   - Actions: Read-only
4. **Subscribe to events**:
   - `installation`
   - `installation_repositories`
   - `issues`
   - `issue_comment`
   - `pull_request`
   - `workflow_run`
5. Click **Create GitHub App**.
6. On the App page, click **Generate a private key** — download the `.pem` file.
7. Note the **App ID** shown at the top of the App settings page.

---

## Environment setup

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

Required variables for local webhook testing:

```
GITHUB_APP_ID=<your-app-id>
GITHUB_PRIVATE_KEY_PATH=./keys/my-app.pem
GITHUB_WEBHOOK_SECRET=<the-secret-you-set-in-the-app>
```

Then start the server:

```bash
cd server
npm start
```

---

## Verifying delivery

- GitHub App settings → **Advanced → Recent Deliveries** shows each delivery
  with request/response.
- The server logs each event with its delivery ID.
- Check `/api/events` to see persisted event records.
