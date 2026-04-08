# Security Policy

## Overview

ReplyAI is an AI-powered email assistant that connects to users' Gmail accounts via OAuth 2.0. This document describes how we protect user data, what data we store, and how to report a vulnerability.

## Data We Store

| Data | Storage | Notes |
|------|---------|-------|
| Gmail OAuth tokens (access & refresh) | PostgreSQL database, encrypted at rest using AES-256-GCM | Encrypted with `TOKEN_ENCRYPTION_KEY` before writing to disk |
| Third-party connector tokens (Slack, Teams, HubSpot, etc.) | PostgreSQL database, JSONB column | Stored in connector `config` field |
| User profile (name, email, plan) | PostgreSQL database | Sourced from Clerk on first login |
| Reply history (subject, from address, generated text) | PostgreSQL database | Retained until account deletion |
| User preferences and settings | PostgreSQL database | Includes default tone, custom instructions |
| Email signatures | PostgreSQL database | Plain text and image data URLs |
| Scheduled emails | PostgreSQL database | Deleted on send or account deletion |

## What We Do NOT Store

- **Email body content**: Email bodies are fetched live from Gmail's API and are never persisted to our database.
- **Calendar event details**: Fetched live from Google Calendar API, not stored.
- **Attachment content**: Attachment metadata is returned from Gmail; content is streamed directly from Gmail to the client.

## Token Protection

Gmail OAuth tokens are encrypted at rest using **AES-256-GCM** symmetric encryption:

- A 32-byte key is derived via `scrypt` from the `TOKEN_ENCRYPTION_KEY` environment variable.
- Each token is encrypted with a unique 12-byte random IV.
- Authentication tags (16 bytes) are stored alongside ciphertext to prevent tampering.
- Encrypted tokens are prefixed with `enc:` to distinguish them from plaintext legacy values.
- Token values are never written to application logs (Pino redact configuration masks them).

## HTTP Security Headers

All API responses include the following security headers via Helmet:

- `Content-Security-Policy` — restricts script and resource origins to trusted domains
- `Strict-Transport-Security` — enforces HTTPS with 1-year max-age and preload
- `X-Frame-Options: DENY` — prevents clickjacking
- `X-Content-Type-Options: nosniff` — prevents MIME-type sniffing
- `Referrer-Policy: strict-origin-when-cross-origin` — limits referrer leakage

## Email HTML Rendering

Incoming email HTML bodies are sanitized server-side before being sent to clients:

- `<script>` tags and self-closing script elements are stripped.
- Inline event handlers (`onclick`, `onload`, etc.) are removed.
- `javascript:` and `vbscript:` URLs are neutralized.
- CSS `expression()` is removed.

On the **web client**, HTML email bodies are rendered inside a fully sandboxed `<iframe>` with `sandbox="allow-popups allow-popups-to-escape-sandbox"` — scripts and same-origin access are disabled.

On the **mobile client**, email HTML is rendered in a WebView with JavaScript disabled (`javaScriptEnabled={false}`) and an empty `originWhitelist` to prevent external navigation.

## Rate Limiting

The API applies tiered rate limiting:

- **Global**: 300 requests/minute per authenticated user
- **AI generation endpoints**: 12 requests/minute per user
- **Email send/compose**: 20 requests/minute per user
- **Account deletion**: 5 requests/hour per user

## Right to Erasure (GDPR/CCPA)

Users can permanently delete their account and all associated data via:

- **Web**: Settings → Danger Zone → Delete my account
- **API**: `DELETE /api/account` (requires authentication)

This endpoint removes all rows across all tables within a database transaction and then calls the Clerk API to delete the user's authentication record.

## Authentication

User authentication is handled entirely by [Clerk](https://clerk.com). ReplyAI does not store passwords. All API endpoints that access user data require a valid Clerk session token.

## Reporting a Vulnerability

We take security seriously. If you discover a vulnerability, please report it responsibly:

**Email**: security@replyai.app

Please include:
- A description of the vulnerability and its potential impact
- Steps to reproduce
- Any supporting materials (screenshots, PoC code)

We will acknowledge your report within 48 hours and aim to resolve confirmed issues within 30 days. We ask that you do not publicly disclose the issue until we have had a chance to address it.

## Scope

In scope for responsible disclosure:
- Authentication bypass or session manipulation
- SQL injection or database exposure
- OAuth token leakage
- XSS in the web or mobile client
- Server-side request forgery (SSRF)
- Privilege escalation between user accounts

Out of scope:
- Rate limit bypass that does not expose data
- Denial-of-service attacks
- Third-party library vulnerabilities that are not yet patched upstream
- Vulnerabilities in Clerk's authentication infrastructure
