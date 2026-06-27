# Public Beta Adoption Checklist

This guide helps early adopters install, configure, and validate JulesOps in a target repository.

---

## 1. Prerequisites Checklist

Before running the installer, ensure your target repository meets these settings:

- [ ] **Target repo initialized**: The target repository is initialized with Git and has the configured base branch locally.
- [ ] **Action permissions configured**: Under **Settings > Actions > General > Workflow permissions**, enable read/write permissions.
- [ ] **Jules secret set**: Under **Settings > Secrets and variables > Actions**, add `JULES_API_KEY`.
- [ ] **GitHub CLI available**: Install and authenticate `gh` if you want automatic label creation.

---

## 2. Installation Terminal Example

Run the installer from your local clone of the JulesOps repository:

```powershell
.\scripts\install-julesops.ps1 -TargetRepo "C:\Users\Asus\Documents\Projects\my-adopter-repo" -BaseBranch main
```

Expected output resembles:

```text
Installed JulesOps into C:\Users\Asus\Documents\Projects\my-adopter-repo (version v0.3.0)
```

Installer output may include overwrite or preserve messages when `-Force` or `-Upgrade` is used.

---

## 3. Label Setup

Run label bootstrapping from the JulesOps source repository:

```powershell
.\scripts\bootstrap-labels.ps1 -TargetRepo "C:\Users\Asus\Documents\Projects\my-adopter-repo"
```

Preview labels without creating them:

```powershell
.\scripts\bootstrap-labels.ps1 -TargetRepo "C:\Users\Asus\Documents\Projects\my-adopter-repo" -DryRun
```

If `gh` is not authenticated or the target repo has no GitHub remote, the script prints a manual checklist.

---

## 4. Validation Terminal Example

After installation, run the validation tool:

```powershell
.\scripts\validate-kit.ps1 -TargetRepo "C:\Users\Asus\Documents\Projects\my-adopter-repo"
```

Expected output resembles:

```text
Verifying base branch 'main' in Git...
  Base branch 'main' verified.
JulesOps kit validation passed.
```

If the target has a GitHub remote and `gh` is authenticated, validation may also check remote labels.

---

## 5. Verification & Testing Checklist

Verify your setup with a test dispatch:

- [ ] Open a new issue in the target repository using the **Jules Task** issue template.
- [ ] Verify that the issue has `jules-queue` and `status:todo` or your configured equivalents.
- [ ] Navigate to **Actions > Jules Dispatch** in the target repository.
- [ ] Click **Run workflow** manually.
- [ ] Verify that Jules receives the task.
- [ ] Verify that the issue transitions to `status:in-progress` with a dispatch comment.
- [ ] Verify that an implementation pull request is opened and linked back to the issue.