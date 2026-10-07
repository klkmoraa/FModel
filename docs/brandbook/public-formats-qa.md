# Public native/DXF artifact QA

REL-001 delegated route B removes experimental DWG from the actual public artifact without changing the project license. Native `.fmodel` and DXF remain public; the default development/test reader remains experimental and enabled. Full professional/legal REL-001 closure remains pending.

Controller-approved source `ac8e21efde9cfe7865108c4a25b32340847aad92` is tree-identical to local `dce61241a99618ce2c7e70770698a33b8fbf93a4` (`8632c32210986f5762558273eab869669129afeb`). [CI 37628277682 / job 112815606193](https://github.com/klkmoraa/FModel/actions/runs/37628277682/job/112815606193) completed successfully: static gates, actual public build and 189-file dist guard passed; all 73 Chromium journeys passed, including the individually confirmed `publicFormats` smoke. The smoke exercises disabled DWG and working native/DXF entry points. The guard checks the actual public output for excluded reader/WASM content and public format truth. Earlier focused source evidence comprises 59 passing tests and approved reviews.

This evidence records the tested public artifact and browser behavior. Actual Pages publication is pending until controller deployment confirmation; controller also owns final exact-tree CI, push, merge and Pages verification.
