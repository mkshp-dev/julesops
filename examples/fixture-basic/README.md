# Basic Test Fixture Repository

This directory contains a minimal adopting repository fixture for repeatable JulesOps installer and validator tests.

## Layout

```text
examples/fixture-basic/
├─ README.md
└─ repo/
   ├─ README.md
   └─ src/app.txt
```

The `repo/` directory intentionally does **not** contain JulesOps-installed `.github` files. Test scripts copy it to a temporary directory, initialize Git, and run installer scenarios there.

## Run the fixture smoke test

From the JulesOps source repository:

```powershell
.\scripts\test-fixture.ps1
```

The smoke test covers:

- dry-run install without writing files
- fresh install
- installed target validation
- resolver execution
- label bootstrap dry run
- upgrade preserving `.github/julesops.yml`
- force overwrite restoring the default generated config
- expected validation failure for a missing configured base branch