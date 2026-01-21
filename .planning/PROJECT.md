# LLM Gateway Google Auth

## What This Is

An internal authentication system that lets nullplatform team members self-service API keys after Google OAuth login. These keys authenticate requests to the LLM Gateway, with metadata injection for usage tracking, throttling, and consumption visibility — specifically enabling controlled Claude Code access for the team.

## Core Value

Team members can get their own API keys in seconds, and every request through the gateway is traceable to a person.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Google OAuth login restricted to @nullplatform.com domain
- [ ] Users and API keys stored in DynamoDB
- [ ] User can view their API keys in admin portal
- [ ] User can create new API keys with custom names
- [ ] User can have multiple API keys
- [ ] User can revoke their API keys
- [ ] Gateway plugin validates API keys against auth service
- [ ] Plugin caches validation responses to reduce DynamoDB/service calls
- [ ] Plugin injects metadata (key name, user email) into request context
- [ ] Metadata available for downstream plugins (tracking, throttling)

### Out of Scope

- API key expiration — not needed for internal team use, revocation sufficient
- Non-nullplatform users — restricted to @nullplatform.com by design
- Built-in rate limiting — can be built separately using injected metadata
- OAuth providers other than Google — team uses Google Workspace

## Context

This gateway already has a plugin system with lifecycle hooks (beforeModel, afterModel, etc.) and a basic API key auth plugin. The new Google auth plugin will follow similar patterns but add:
- External service dependency (auth service)
- Response caching for cost optimization
- Metadata injection into request context

The admin portal is a new web component — no existing UI in this repo.

DynamoDB chosen for cost efficiency with small team usage patterns. The plugin will cache auth responses to minimize DynamoDB reads.

## Constraints

- **Tech stack**: Node.js backend, React + Vite frontend, DynamoDB storage
- **Repo structure**: Monorepo — new packages under `packages/`
- **Domain restriction**: @nullplatform.com emails only (enforced at OAuth level)
- **Compatibility**: Plugin must work with existing gateway plugin system and request context

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| DynamoDB over SQL | Cost-effective for low-volume internal use, simple key-value patterns | — Pending |
| Cache in plugin | Reduce DynamoDB reads and auth service calls, cheaper operation | — Pending |
| Monorepo structure | Keep related components together, shared types possible | — Pending |
| No key expiration | Revocation is sufficient for internal team, simpler UX | — Pending |

---
*Last updated: 2025-01-21 after initialization*