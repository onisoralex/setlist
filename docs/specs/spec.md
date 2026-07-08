# Spec Template

Use this file as the format reference when writing implementation specs. Copy it, rename it (`01-module-name.md`), and fill in the sections. Delete sections that do not apply.

Naming convention: `NN-module-name.md` where `NN` is a zero-padded sequence number reflecting build order (e.g. `00-foundation.md`, `01-pantry.md`).

---

# Spec NN — Module Name (Phase N)

**Status:** Draft | Ready to implement | In progress | Done
**Date:** YYYY-MM-DD
**Produced by:** <worker or author>
**Depends on:** <list prior specs this one requires, or "Nothing">

---

## Overview

One paragraph. What this module does, what problem it solves, and where it fits in the build order.

---

## 1. Data Models

List each database table with its columns, types, and constraints. Include indexes. Not full DDL prose — structured enough for a Developer to write the migration without guessing.

```sql
CREATE TABLE example (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Note foreign keys and what happens on delete (RESTRICT / CASCADE / SET NULL).

---

## 2. API Endpoints

For each endpoint: method, path, request shape, response shape, and HTTP status codes used.

```
GET /api/v1/<module>/<resource>
POST /api/v1/<module>/<resource>
PATCH /api/v1/<module>/<resource>/:id
DELETE /api/v1/<module>/<resource>/:id
```

Use the standard response envelope (see `docs/architecture.md §4`).

---

## 3. Business Logic

Describe rules and sequences that aren't obvious from the data model or endpoints alone. If there's a multi-step process, describe each step. If there's a decision tree, describe the branches.

---

## 4. External Integrations

For each external API or service used by this module: what it is, the relevant endpoint(s), required headers, rate limits, and how failures are handled.

---

## 5. Frontend Screens

List the screens/views this module needs and their key interactions. Functional description only — no design spec required.

- **Screen name** (`/route`) — what the user can do here, what API calls it makes

---

## 6. Edge Cases

Explicit list of edge cases and how each is handled. If it is not listed here, the Developer should ask before making assumptions.

---

## Module File Responsibilities

| File | Responsibility |
|---|---|
| `module.routes.js` | Register Express routes, apply middleware |
| `module.controller.js` | Validate request/response, call service |
| `module.service.js` | Business logic, external API calls |
| `module.model.js` | All SQL queries |

---

## Assumptions

Explicit list of assumptions made. If any assumption is wrong, this spec needs revisiting before implementation continues.
