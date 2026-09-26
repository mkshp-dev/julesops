# Privacy Policy

**Last updated: 2026-07-08**

This policy describes how JulesOps handles data. It covers the JulesOps GitHub Action and workflow kit.

---

## 1. What JulesOps is

JulesOps is a free, open-source workflow kit that you install into your own GitHub repository. It consists of GitHub Actions workflows, configuration templates, and helper scripts.

---

## 2. Free Workflow Kit — data handling

The free workflow kit runs entirely inside GitHub Actions within your own repository. JulesOps does not operate a hosted backend for the free kit.

**Data that stays in your repository (GitHub surfaces you own):**

- GitHub issues and labels
- Pull requests
- GitHub Actions workflow run logs
- Repository secrets (e.g. `JULES_API_KEY`) — stored in GitHub's encrypted secrets store, not read by JulesOps servers

**JulesOps does not:**

- Collect analytics or telemetry from the free kit
- Transmit issue, PR, or repository data to JulesOps-operated servers
- Collect or store payment data (JulesOps is free; optional donations go through GitHub Sponsors and are subject to GitHub's terms)
- Set cookies or track users

---

## 3. Self-hosted server

The optional server in `server/` is software you run yourself. Its data stays on the infrastructure you deploy it to; JulesOps does not operate a hosted service.

---

## 4. Third-party services

The free kit interacts with:

- **GitHub** — all workflow activity is subject to [GitHub's Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).
- **Google Jules** — issues dispatched to Jules are subject to Google's applicable terms. Review Google's privacy policy for Jules before use.

---

## 5. Contact

Security and privacy concerns can be reported using the process in `SECURITY.md`. For general questions, open a GitHub issue.