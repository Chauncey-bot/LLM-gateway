---
name: agent-provisioning
description: Provision an existing user as an agent by assigning a subdomain, activating referral attribution, configuring the agent site route, and verifying the purchase flow. Use when a user asks to add or map an agent account; do not create a second account system or modify upstream open-source source.
---

# Agent Provisioning

Use this skill only for an explicit request to add or map a specific existing account. The normal inputs are an account email and a requested subdomain, for example `agent1@zhisales.com` and `gpt`.

## Product boundary

- Reuse the existing user account and existing `sub2api user_id`.
- Do not create a new login system, agent user table, tenant database, or cloned frontend.
- Keep the agent mapping in `referral-rewards-service` and the subdomain route in the deployment layer.
- Treat `sub2api` and any other upstream open-source project as read-only. Make changes only in the owned referral service, payment service, deployment configuration, and documentation.

## Required workflow

1. Read [references/provisioning-runbook.md](references/provisioning-runbook.md) before making an operational change.
2. Resolve the email to exactly one existing `user_id`. Use a protected admin/API or a minimal database query. Do not print other users' emails, credentials, tokens, or environment files.
3. Validate the subdomain as one DNS label and reject reserved names such as `www`, `api`, `admin`, `app`, `auth`, `static`, and `mail`.
4. Ensure the deployed `referral-rewards-service` contains:
   - `agent_subdomains` schema
   - `GET /api/site/context`
   - admin subdomain mapping endpoints
   - Host-based registration binding
   - best-effort automatic binding on authenticated rewards requests
5. Ensure the mapping is active through the admin endpoint, using the service's protected admin key without putting the key in command text or logs:
   - `POST /admin/agent-subdomains` with `{ "user_id": <id>, "subdomain": "<label>" }`
6. Configure the exact subdomain in the reverse proxy. For the shared SPA:
   - `/purchase` must fall through to the latest SPA
   - `/pay-api/*` must go to `zhisales-pay-service`
   - `/api/site/context` and referral/points/redemption paths must go to `referral-rewards-service`
   - generic API and static fallback routes must preserve the existing site behavior
7. Add the new origin to the owned payment service CORS allowlist when the deployed purchase bundle calls the payment API from `www.zhisales.com`.
8. Validate before reporting completion:
   - service health is OK
   - `Host: <subdomain>.<base-domain>` resolves to the expected `user_id`
   - the HTTPS root returns the SPA
   - `/purchase` returns the SPA title, not the legacy payment HTML
   - `/pay-api/catalog` returns catalog JSON
   - the payment response allows the agent origin when the page uses a cross-origin payment base URL
9. If the account registered before automatic binding was deployed, bind that account once through the internal binding endpoint using the mapped subdomain. Confirm the relationship points to the mapped agent.

## Release and safety

- For service code changes, build the exact owned service image locally, run its available checks, and deploy only that service. Preserve the previous image and deployment configuration before restarting.
- Never use a canary-only command as a production release command. If the production path, service name, override files, or rollback path is not established, stop before production mutation and ask for the approved deployment details.
- If a deployment health check fails, restore the previous service image/configuration before attempting another state-changing operation.
- Do not modify `frontend/` or upstream source merely to add an agent. The existing frontend is shared; agent identity comes from the request Host.

## Completion response

Report the mapped account ID, the public subdomain, the verification results, and any remaining DNS or certificate issue. Do not report admin keys, passwords, tokens, database credentials, or unrelated user data.
