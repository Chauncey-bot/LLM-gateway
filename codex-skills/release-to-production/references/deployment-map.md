# ZhisalesLLM deployment map

Read only the section needed for the changed component.

## Release boundary

Classify each changed component by ownership before release:

- The open-source main project's frontend, including `frontend/` and its generated SPA bundle, may be modified, built, and released.
- The open-source main project's backend may not be modified, built for release, or deployed.
- Frontend and backend code in other non-open-source projects may be modified and released through their documented production workflows.
- If a change mixes the open-source main backend with an allowed component, release only the allowed component and leave the prohibited backend changes untouched.

## Frontend

Scope: `frontend/` changes, or changes that affect the SPA bundle.

Local gate:

```bash
cd frontend
npm ci
npm run build
npm run test:run
cd ..
```

The Vite output is `backend/internal/web/dist` (configured in `frontend/vite.config.ts`). The maintained production deploy script is:

```bash
SSH_PRIVATE_KEY=/secure/path/production.pem ./scripts/deploy-frontend-static.sh
```

The script defaults to host `52.221.30.93`, user `ubuntu`, and path `/var/www/zhisales-site`; override with `DEPLOY_HOST`, `DEPLOY_USER`, and `DEPLOY_PATH` only when the user gives a different target. It verifies that every local build file exists remotely. Afterward check the SPA and an entry asset, for example:

```bash
curl -fsSI https://ai.zhisales.com/
curl -fsSI https://ai.zhisales.com/assets/<entry-file-from-index.html>
```

## Open-source main backend

Changes to the open-source main project's backend are prohibited for this workflow. Do not modify, build, upload, restart, or release them. If the ownership of a backend directory is uncertain, stop and ask before changing or deploying it.

## Non-open-source projects

Non-open-source projects may use their maintained project-specific production workflows. For this repository, `subscription-reset-service/`, `zhisales-pay-service/`, `referral-rewards-service/`, and `quota-gateway/` are separate service components; use their documented build, test, deployment, and health-check instructions when the requested change is within their scope. Do not use a canary script as a production release command.

## Mixed changes

If a change spans multiple components, complete and verify each component's local gate first. Publish components one at a time in dependency order, retaining the exact image tag or build commit for each. Do not bundle unrelated production changes merely because they are in the same working tree.
