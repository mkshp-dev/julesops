# GitHub App Local Development Guide

This guide describes local setup for the JulesOps GitHub App webhook processing backend. The repository now includes a minimal runnable backend skeleton in `server/`; GitHub App authentication, OAuth, billing, and production persistence are still future work.

---

## 1. Register a Development GitHub App

To test App behavior locally, you should create a personal/development GitHub App:

1. In your GitHub account, navigate to **Settings > Developer Settings > GitHub Apps > New GitHub App**.
2. Set configuration parameters:
   - **GitHub App name**: `JulesOps-Dev-<yourname>`
   - **Homepage URL**: `https://github.com/mkshp-dev/julesops`
   - **Webhook**: Check **Active**.
   - **Webhook URL**: Enter your local webhook forwarding URL (see Section 2).
   - **Webhook secret**: Create a secure random string (e.g. `my-local-webhook-secret-123`).
3. Set **Permissions**:
   - **Repository Permissions**:
     - **Metadata**: `Read-only`
     - **Issues**: `Read & Write`
     - **Pull Requests**: `Read & Write`
     - **Contents**: `Read-only` (or `Read & Write` if developing Auto-Upgrade features)
     - **Actions**: `Read-only`
4. Set **Subscribe to events**:
   - Select: `issues`, `pull_request`, `issue_comment`, `workflow_run`, `installation`, `installation_repositories`.
5. Save changes, then click **Generate a private key** and download the `.pem` file. Note your **App ID** on the App settings page.

---

## 2. Set Up Webhook Forwarding

Since GitHub cannot send webhooks directly to `localhost`, you must use a proxy tool (like `smee.io` or `ngrok`) to forward events.

### Option A: Smee.io (Recommended)
1. Go to [smee.io](https://smee.io/) and click **Start a new channel**. Copy the unique URL (e.g. `https://smee.io/abc123xyz`).
2. Update your GitHub App's **Webhook URL** setting with this Smee URL.
3. Install the Smee CLI client:
   ```bash
   npm install --global @smee-io/smee-client
   ```
4. Run Smee to forward webhooks to your local server:
   ```bash
   smee --url https://smee-url-here --path /api/webhooks --port 3000
   ```

---

## 3. Configure Local Environment

For the current no-dependency server skeleton, set:

```env
PORT=3000
HOST=127.0.0.1
GITHUB_WEBHOOK_SECRET=my-local-webhook-secret-123
JULESOPS_DATA_DIR=./data
```

Run locally:

```powershell
cd server
$env:GITHUB_WEBHOOK_SECRET="my-local-webhook-secret-123"
npm start
```

Run the smoke test from another terminal:

```powershell
cd server
$env:GITHUB_WEBHOOK_SECRET="my-local-webhook-secret-123"
npm run smoke
```

Future App work will add `GITHUB_APP_ID`, private key handling, installation tokens, OAuth, and database connection configuration.

---

## 4. Testing Webhook Handlers

Verify your local setup with:

1. **Install Dev App**: Navigate to your GitHub App settings page, click **Install App**, and install it onto a test repository.
2. **Launch Dev Server**: Start your local development backend server.
3. **Trigger Events**:
   - **Label Sync Test**: Labeled an issue with the queue label (e.g. `jules-queue`). Verify that:
     - Smee receives the `issues` labeled event.
     - Local dev server successfully parses the payload and prints details.
   - **Command Test**: Post a `/jules retry` comment on a task issue. Verify that:
     - Local server receives `issue_comment` event.
     - Logs show commenter association check passing, and a mock status comment is printed.
4. **Inspect Delivery logs**:
   - In GitHub App settings, click **Advanced > Recent Deliveries** to see the payload sent by GitHub and inspect response status codes (expected `200 OK`).
