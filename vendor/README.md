# Vendor Directory

This directory stores unmodified approved source snapshots outside agent discovery paths, keyed by `source-id/commit/`.

## Policy

- Files vendored here are pristine upstream snapshots at the exact approved commit recorded in `registry/approved.lock.json`.
- Vendored source code is treated as data, never auto-executed during discovery or packaging.
- Agent skill installers and recursive scanners MUST NOT discover files within this directory.
- Attribution notices and original copyright headers are preserved verbatim.

