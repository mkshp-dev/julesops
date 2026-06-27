# Fixture Basic

This is a deliberately tiny adopting repository fixture used by JulesOps installer tests.

It is not a JulesOps source repo and should not contain installed `.github` JulesOps files at rest. Test scripts copy this fixture to a temporary directory, initialize Git, and install JulesOps there.