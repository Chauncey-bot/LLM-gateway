# Agent provisioning runbook

This runbook supports `$agent-provisioning` in this workspace. Substitute the deployment host and base domain from the current deployment records; never guess them.

## 1. Resolve the account

Resolve the requested email to one existing account. Prefer the existing admin API. If a direct database query is required, return only the matching `id` and avoid selecting other users' identity fields.

Record the result privately as:

```text
agent_user_id=<existing user id>
subdomain=<one DNS label>
```

Do not create a user when the email is missing or ambiguous.

## 2. Check the owned service

The mapping is stored by `referral-rewards-service`:

```http
POST /admin/agent-subdomains
X-Admin-Key: <protected admin key>
Content-Type: application/json

{
  "user_id": 106,
  "subdomain": "gpt"
}
```

The service creates or activates the single mapping for that user. It creates the user's existing referral profile when needed. The response should contain `status: "active"` and the public URL.

Useful read-only checks:

```http
GET /admin/agent-subdomains
GET /api/site/context
```

The second request must carry the agent Host header, for example `Host: gpt.zhisales.com`.

## 3. Registration attribution

The public registration UI may still omit `referral_code` when a user enters through a subdomain. The owned rewards service handles this in two places:

- `POST /api/referral/bind-registration` prefers the active agent subdomain from the request Host.
- Authenticated rewards requests perform a best-effort bind so the existing shared frontend does not need a source change.

For an already-created account, use the protected internal endpoint:

```http
POST /internal/referrals/bind-registration
X-Internal-Key: <protected internal key>
Content-Type: application/json

{
  "referred_user_id": 107,
  "subdomain": "gpt"
}
```

The relationship must be one-to-one for the referred user. Existing relationships are not overwritten by an agent; only the administrator correction endpoint may change them.

## 4. Reverse proxy route

For each mapped agent subdomain, preserve the shared SPA and route the owned APIs. The effective route shape is:

```text
https://<subdomain>.<base-domain>/                    -> shared SPA
https://<subdomain>.<base-domain>/purchase             -> shared SPA purchase route
https://<subdomain>.<base-domain>/pay-api/*             -> payment service
https://<subdomain>.<base-domain>/api/site/context     -> referral service
https://<subdomain>.<base-domain>/api/referral/*        -> referral service
https://<subdomain>.<base-domain>/api/points/*          -> referral service
https://<subdomain>.<base-domain>/api/redemptions/*     -> referral service
```

Do not send `/purchase` to the legacy payment HTML when the shared frontend has a `/purchase` route. Keep `/pay-api/*` separate so the page can create orders.

## 5. CORS check

The deployed payment bundle may use an absolute `www` payment API base URL. If so, the owned payment service must allow:

```text
https://<subdomain>.<base-domain>
```

Verify the response includes `Access-Control-Allow-Origin` matching the agent origin for `/pay-api/catalog` and the preflight response. If the bundle uses a relative API base URL, keep the same-origin route and no additional origin entry is needed.

## 6. Verification checklist

Run checks through the actual production host only after the user explicitly asked for the operational change:

```text
GET https://<subdomain>.<base-domain>/
GET https://<subdomain>.<base-domain>/purchase
GET https://<subdomain>.<base-domain>/api/site/context
GET https://<subdomain>.<base-domain>/pay-api/catalog
GET /health on referral and payment services
```

Expected results:

- root and `/purchase` return the shared SPA document
- site context returns the mapped agent `user_id`
- catalog returns JSON
- health checks return `status: ok`
- no request goes to the legacy purchase HTML by mistake

## 7. Rollback

If the new service fails health checks, restore the previous service image and Compose/override file, then reload the reverse proxy only after its configuration validates. Keep the database mapping unless the user explicitly asks to disable it; disabling the mapping is a separate operation:

```http
DELETE /admin/agent-subdomains/<subdomain>
```

Do not delete the user's account or rewrite an existing referral relationship as part of route rollback.
