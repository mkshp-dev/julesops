# Public Beta Adoption Checklist

This guide provides a comprehensive checklist and terminal execution examples to help early adopters successfully install, configure, and validate **JulesOps** in their repositories.

---

## 1. Prerequisites Checklist

Before running the installer, ensure your target repository meets these settings:

- [ ] **Target Repo Init**: The target repository is initialized with Git and has a clean working tree.
- [ ] **Base Branch Configured**: The main development branch exists (e.g. `main` or `master`).
- [ ] **Action Permissions**: Under **Settings > Actions > General > Workflow permissions**, ensure:
  - "Read and write permissions" is selected.
  - "Allow GitHub Actions to create and approve pull requests" is checked.
- [ ] **Jules Secret Set**: Under **Settings > Secrets and variables > Actions**, add:
  - `JULES_API_KEY`: Set to your Google Jules API key.

---

## 2. Installation Terminal Example

Run the installer from your local clone of the JulesOps repository. This script automates copying template instruction files, creating the GitHub Action workflows, and generating configuration files.

```powershell
# Install JulesOps into target repo, targeting the main branch
.\scripts\install-julesops.ps1 -TargetRepo "C:\Users\Asus\Documents\Projects\my-adopter-repo" -BaseBranch main
```

### Expected Output Screenshot / Console Run:
```text
PS C:\Users\Asus\Documents\Projects\julesops> .\scripts\install-julesops.ps1 -TargetRepo "C:\Users\Asus\Documents\Projects\my-adopter-repo" -BaseBranch main
Installing JulesOps kit files to C:\Users\Asus\Documents\Projects\my-adopter-repo...
Creating directory C:\Users\Asus\Documents\Projects\my-adopter-repo\.github
Creating directory C:\Users\Asus\Documents\Projects\my-adopter-repo\.github\ISSUE_TEMPLATE
Creating directory C:\Users\Asus\Documents\Projects\my-adopter-repo\.github\workflows
Copying templates/jules-core.md to C:\Users\Asus\Documents\Projects\my-adopter-repo\.github\jules-core.md...
Copying templates/jules-task.yml to C:\Users\Asus\Documents\Projects\my-adopter-repo\.github\ISSUE_TEMPLATE\jules-task.yml...
Copying templates/julesops.yml to C:\Users\Asus\Documents\Projects\my-adopter-repo\.github\julesops.yml...
Copying templates/resolve-config.py to C:\Users\Asus\Documents\Projects\my-adopter-repo\.github\resolve-config.py...
Copying workflows/jules-dispatch.yml to C:\Users\Asus\Documents\Projects\my-adopter-repo\.github\workflows\jules-dispatch.yml...
Copying workflows/jules-state-sync.yml to C:\Users\Asus\Documents\Projects\my-adopter-repo\.github\workflows\jules-state-sync.yml...
Copying workflows/jules-watchdog.yml to C:\Users\Asus\Documents\Projects\my-adopter-repo\.github\workflows\jules-watchdog.yml...
Creating default C:\Users\Asus\Documents\Projects\my-adopter-repo\.github\jules-repo.md instruction stub...
Customizing config file at C:\Users\Asus\Documents\Projects\my-adopter-repo\.github\julesops.yml...
Adding kit version headers to installed files...
Installed JulesOps into C:\Users\Asus\Documents\Projects\my-adopter-repo (version v0.1.0)
```

---

## 3. Validation Terminal Example

After installation, run the validation tool to inspect target repository setup. The validator checks if all required workflows exist, configuration settings match the specifications, and repository labels exist on GitHub.

```powershell
# Validate the target installation
.\scripts\validate-kit.ps1 -TargetRepo "C:\Users\Asus\Documents\Projects\my-adopter-repo"
```

### Expected Output Screenshot / Console Run:
```text
PS C:\Users\Asus\Documents\Projects\julesops> .\scripts\validate-kit.ps1 -TargetRepo "C:\Users\Asus\Documents\Projects\my-adopter-repo"
Verifying base branch 'main' in Git...
  Base branch 'main' verified.
Verifying configuration state labels on GitHub for 'my-org/my-adopter-repo'...
  All configured labels verified on GitHub.
JulesOps kit validation passed.
```

---

## 4. Verification & Testing Checklist

Verify your setup with a test dispatch:

- [ ] **Label Setup**: Run `bootstrap-labels.ps1` in your target repository to automatically create the required state labels on GitHub:
  ```powershell
  .\scripts\bootstrap-labels.ps1
  ```
- [ ] **First Task Creation**:
  - Open a new issue in the target repository using the **Jules Task** issue template.
  - Verify that the issue is automatically labeled with `jules-queue` and `status:todo`.
- [ ] **Manual Dispatch Run**:
  - In the target repository, navigate to **Actions > Jules Dispatch**.
  - Click **Run workflow** manually.
  - Verify that:
    1. Jules receives the task.
    2. The issue transitions to `status:in-progress` on the timeline with a dispatch comment.
    3. An implementation pull request is opened.
