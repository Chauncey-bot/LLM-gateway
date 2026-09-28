---
name: release-to-production
description: Build an approved frontend or non-open-source project locally, run its checks, then deploy the verified release to production using the repository's maintained deployment path. Open-source main-project backend changes are prohibited.
---

# Release to production

Use this skill for the complete release workflow in this repository. The required order is:

1. Identify the changed component from `git diff --name-only` and read the matching section in [references/deployment-map.md](references/deployment-map.md).
2. Classify the target before changing or releasing it. The open-source main project's frontend is allowed to be modified, built, and deployed. The open-source main project's backend is prohibited. Frontend and backend code belonging to other non-open-source projects is allowed when its maintained deployment path is documented. Do not infer permission from a directory name alone; use the repository map and project ownership.
3. Inspect the diff and confirm that no `.env`, private key, database dump, build output, or unrelated user change will be included.
4. Perform the component's local install, tests, and production build. Treat any failure as a hard stop; do not upload or restart production after a failed local step.
5. Before the first production-mutating command, confirm that the user is asking for production (not only a build, review, or canary). Never expose secrets in command text or logs.
6. Run the maintained deployment script or the explicitly documented production command for that component. Do not substitute a canary script for production.
7. Run the documented post-release health checks and report the exact component, build/image identifier, target, and verification result.

## Component routing

- Frontend changes under `frontend/` use the frontend build and `scripts/deploy-frontend-static.sh`.
- Changes to the open-source main project's backend are outside this workflow. Do not modify, build, or release them; stop and report the boundary violation.
- Changes to non-open-source projects use their maintained project-specific build, test, and production deployment path. If ownership or the deployment path is unclear, stop before mutation and ask for the missing boundary or command.

## Safety invariants

- Never modify, build for release, or deploy the open-source main project's backend. Existing unrelated changes to that backend must remain untouched and must not be included in another component's release.
- The open-source main project's frontend is an approved release boundary. Its generated `backend/internal/web/dist` directory is a frontend build artifact and does not authorize modifying or releasing the backend source that serves it.
- Non-open-source project frontends and backends may be released only after their ownership, local checks, deployment command, and post-release health check are verified.
- Local compilation/build is mandatory before any `scp`, `ssh` restart, image upload, or production API mutation.
- Build and deploy the same artifact. For the SPA, upload the complete `backend/internal/web/dist` tree from one build; never upload only `index.html` or guessed chunks.
- Deploy one component at a time and recreate only the intended service.
- Do not run catalog migrations, subscription mutations, payment actions, or database restores as part of a generic release check.
- If deployment or health verification fails, stop, preserve the failure output, and do not retry destructive or state-changing operations without a clear recovery plan.
