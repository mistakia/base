---
title: Review for Secret Information
type: guideline
description: >-
  Guidelines for reviewing and identifying secret information such as passwords, API keys, and
  credentials that must be encrypted at rest
base_uri: sys:system/guideline/review-for-secret-information.md
created_at: '2025-08-16T06:14:19.493Z'
entity_id: 2f2c03c3-48b6-48e9-a365-bebeb1c02717
observations: []
relations:
  - follows [[sys:system/guideline/write-guideline.md]]
  - follows [[user:guideline/write-text.md]]
  - related_to [[sys:system/guideline/review-for-personal-information.md]]
tags: []
updated_at: '2026-01-05T19:25:17.453Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

Secret information includes any credentials, keys, or authentication data that could compromise system security if exposed.

## Types of Secret Information

### Authentication Credentials

- Usernames and passwords
- Database connection strings
- Service account credentials
- SSH keys and certificates
- OAuth tokens and refresh tokens
- JWT signing keys

### API Keys and Tokens

- Third-party API keys
- Monitoring and analytics keys
- CI/CD pipeline tokens
- Webhook secrets

### Cryptographic Material

- Encryption keys
- Private keys for certificates
- HMAC secrets
- Salt values for hashing
- Initialization vectors

### Infrastructure Secrets

- Database passwords and connection URLs
- Redis/cache passwords
- VPN configurations

## Storage Requirements

All secret information MUST be encrypted at rest using one of these formats:

- `ENCRYPTED|<hmac>` - Standard encrypted format with HMAC verification
- Environment variables with encryption wrapper
- Dedicated secret management systems (HashiCorp Vault, AWS Secrets Manager, etc.)
- Encrypted configuration files with proper key management
