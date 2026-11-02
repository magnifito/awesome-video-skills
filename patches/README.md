# Patches Directory

This directory stores small, documented patches tied to a specific approved source baseline, organized as `patches/source-id/`.

## Policy

- Every patch must declare its target upstream baseline commit.
- Patches document Magnifito-specific adaptations (such as isolating unpinned installers, removing recursive skill scanning, or substituting internal asset references).
- Pristine upstream code remains in `vendor/`; patches are applied explicitly during sandboxed build steps.
