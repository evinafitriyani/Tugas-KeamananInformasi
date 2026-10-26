# Product Requirements Document (PRD)

# CampusVault — Secure Document Storage for Campus Organizations

**Document status:** Implementation-ready  
**Target repository:** `evinafitriyani/Tugas-KeamananInformasi`  
**Current application:** CipherDock  
**Target application:** CampusVault  
**Intended executor:** OpenCode coding agent using DeepSeek V4.1 Flash Free  
**Primary stack:** Node.js, Express, SQLite, vanilla HTML/CSS/JavaScript  
**Deployment target:** Local demonstration only  
**Primary language for UI and documentation:** Indonesian  

---

## 1. Purpose of This Document

This PRD is the authoritative implementation specification for transforming the existing CipherDock repository into **CampusVault**, a secure local web application for storing confidential documents belonging to campus organization administrators.

The coding agent must implement the requirements in this document against the repository's actual state. The agent must not replace working components without a clear requirement, invent benchmark results, claim security properties that are not implemented, or silently expand the product scope.

The required result is a demonstrable academic application that:

1. authenticates users on the server;
2. restricts each user to that user's own files;
3. accepts personal-data files, identity scans, office documents, and videos;
4. encrypts stored file contents using AES, DES, or RC4;
5. uses AES-CBC and DES-CBC, never ECB;
6. protects ciphertext integrity using HMAC-SHA-256 with encrypt-then-MAC;
7. restores files byte-for-byte;
8. benchmarks AES, DES, and RC4 using the same input files and a reproducible method;
9. clearly states that DES and RC4 are included only for academic comparison;
10. can be installed, tested, and demonstrated locally from a clean clone.

---

## 2. Project Context

### 2.1 Scenario

Campus organizations such as BEM, student associations, and event committees may store confidential operational documents, including:

- member data in CSV format;
- dummy identity-card scans in PDF, JPG, JPEG, or PNG format;
- cooperation letters, proposals, participant lists, and financial reports in PDF, DOCX, XLSX, or PPTX format;
- internal event documentation in MP4 or WebM format.

Documents may contain personal data or internal organizational information. CampusVault protects file contents at rest and prevents one authenticated user from retrieving another user's files.

### 2.2 Privacy context

The project report must relate the scenario to **Indonesia Law No. 27 of 2022 on Personal Data Protection (UU PDP)** and may additionally discuss GDPR principles where relevant. The application is an academic prototype, not a claim of legal compliance or production certification.

The implementation must support the following privacy-oriented behavior:

- data minimization: use username only, without requiring email;
- purpose limitation: files are stored only for private document storage and cipher evaluation;
- access limitation: only the authenticated owner can access a file;
- retention control: an owner can delete an owned file;
- dummy data only: no real identity documents or personal records may be committed;
- confidentiality and integrity: encrypted storage plus HMAC validation.

---

## 3. Confirmed Product Decisions

These decisions are fixed unless a repository constraint makes one technically impossible. If that occurs, the agent must stop that specific item, document the blocker, and continue with other independent items.

1. **Access model:** owner-only. No organization workspace, sharing, RBAC, or admin role.
2. **Stack:** retain Express, SQLite, and vanilla JavaScript.
3. **Authentication:** server-side sessions using an `HttpOnly` cookie.
4. **Identity fields:** username and password only. Email is not required.
5. **Storage:** ciphertext on the local filesystem; metadata in SQLite.
6. **Key design:** one master secret loaded from an environment variable. Separate encryption and MAC keys must be derived using HKDF with domain separation. Per-file DEK wrapping is not required for this scope.
7. **Ciphertext format:** versioned JSON envelope.
8. **Integrity:** AES, DES, and RC4 must all use HMAC-SHA-256 with encrypt-then-MAC.
9. **DES implementation:** use an isolated JavaScript cryptography library that provides actual single DES-CBC. Do not silently substitute 3DES. Do not enable a process-wide OpenSSL legacy provider merely to make DES available.
10. **Legacy data:** delete existing application data. Do not migrate old ciphertext or plaintext passwords.
11. **Git history:** sensitive data and secrets must be removed from current history through a coordinated history rewrite. The old key is considered compromised and must never be reused.
12. **Ciphertext utilities:** retain authenticated download of encrypted ciphertext; remove external ciphertext decryption.
13. **File operations:** upload, list, decrypt-and-download, download ciphertext, and delete.
14. **Maximum upload size:** 25 MiB per file.
15. **Allowed types:** CSV, PDF, JPG, JPEG, PNG, DOCX, XLSX, PPTX, MP4, and WebM.
16. **Default cipher:** AES-CBC. DES-CBC and RC4 remain selectable, with explicit academic-only warnings.
17. **Benchmark scope:** measure the cryptographic pipeline, not HTTP/network, rendering, database, or filesystem-write latency.
18. **Benchmark method:** one warm-up and ten measured iterations per file-and-algorithm combination; compute mean, median, minimum, maximum, standard deviation, throughput, size overhead, and correctness.
19. **Benchmark fixtures:** four dummy fixtures representing CSV personal data, identity scan, office document, and video.
20. **Benchmark output:** JSON and CSV generated from real executions, plus a UI summary. Results must never be hard-coded.
21. **Deployment:** local-only demonstration.
22. **Documentation scope:** application, automated tests, README, benchmark runner, and benchmark-output schema/template. The final two-page academic report is not to be populated with invented measurements.

---

## 4. Existing Repository Baseline

The agent must verify this baseline before implementation and must not assume it remains unchanged.

Known baseline from the repository audit:

- The application is currently branded CipherDock.
- Express serves both the API and a vanilla JavaScript SPA.
- SQLite stores users and file metadata.
- The filesystem stores temporary plaintext and ciphertext.
- There is no valid server-side authentication session.
- File ownership is based on a client-supplied username.
- File decryption can be requested by file ID without owner verification.
- AES-CBC and RC4 currently round-trip basic files, but lack authenticated integrity.
- DES-CBC fails under the current Node/OpenSSL runtime.
- The encryption key is hard-coded and globally reused.
- Sensitive database, ciphertext, plaintext, `node_modules`, and build artifacts have been committed.
- The registration UI calls the wrong endpoint.
- Some UI-referenced API endpoints do not exist.
- The old database schema and current code disagree.
- There is no migration system, automated testing, benchmark harness, lint script, `.env.example`, Docker setup, or CI.

This baseline is diagnostic information, not permission to preserve insecure behavior.

---

## 5. Scope

### 5.1 In scope

- CampusVault branding and scenario-specific copy.
- Clean dependency management and `.gitignore`.
- Reproducible SQLite migrations.
- Username/password registration and login.
- Server-side sessions and logout.
- Owner-only file authorization.
- Safe upload validation and 25 MiB limit.
- Local encrypted file storage.
- AES-256-CBC, single DES-CBC, and RC4.
- HMAC-SHA-256 encrypt-then-MAC for all three algorithms.
- Versioned encryption envelope.
- Download of restored plaintext by the owner.
- Download of ciphertext envelope by the owner.
- File deletion by the owner.
- Reproducible benchmark runner and real output files.
- Automated unit and integration tests.
- README and demo instructions.
- Security headers, rate limiting, CSRF protection appropriate to the session design, and output-safe DOM rendering.

### 5.2 Out of scope

- Organization workspaces, memberships, roles, or sharing.
- Administrator dashboard.
- Public share links.
- External decrypt endpoint.
- Password reset, email verification, MFA, or SSO.
- Cloud object storage or paid key-management services.
- Full end-to-end encryption where the server cannot decrypt.
- Video transcoding or preview.
- Antivirus scanning.
- Mobile application.
- Production deployment, production certification, or compliance claims.
- Migration of legacy passwords or ciphertext.
- Per-file DEK wrapping and automated key rotation.

---

## 6. User Roles and Core User Stories

There is one application role: **authenticated user**.

### US-01 Registration

As a campus organization administrator, I want to create an account with a username and password so that I can maintain a private file collection.

**Acceptance criteria:**

- Username is normalized and validated.
- Username uniqueness is enforced in SQLite.
- Password is never stored in plaintext or reversible form.
- Password is hashed with Node's `crypto.scrypt` and a unique random salt.
- Invalid input receives a generic, safe response.
- Registration does not automatically trust a client-provided identity for later API calls.

### US-02 Login and logout

As a registered user, I want to sign in and sign out so that the server can identify which private files I may access.

**Acceptance criteria:**

- Successful login creates a server-side session.
- The browser receives an `HttpOnly`, `SameSite=Lax` session cookie.
- Set `Secure` in production mode; allow local HTTP development without falsely requiring HTTPS.
- Session ID is regenerated after login.
- Logout invalidates the server-side session and clears the cookie.
- Invalid credentials use a generic error message.
- Login attempts are rate-limited.

### US-03 Upload and encrypt a file

As an authenticated user, I want to upload an allowed file and select AES, DES, or RC4 so that its stored content is encrypted.

**Acceptance criteria:**

- AES is preselected.
- Maximum file size is 25 MiB.
- Allowed extensions and expected MIME types are enforced.
- Where reliable signatures exist, validate magic bytes in addition to extension and MIME.
- Original filename is sanitized for display and never used as the physical storage filename.
- Storage filename is generated with a cryptographically random identifier.
- Owner identity always comes from the authenticated session.
- The client cannot set or override `owner_id`.
- The temporary plaintext is deleted in a `finally` path after success or failure.
- A failed encryption or database operation does not leave a downloadable plaintext or inconsistent metadata row.
- Unsupported algorithm values fail closed and do not delete the only recoverable copy before cleanup.

### US-04 List owned files

As an authenticated user, I want to see only my files.

**Acceptance criteria:**

- The API queries by both authenticated `owner_id` and file ID where applicable.
- The API never accepts `username` as the authority for ownership.
- Returned metadata does not include disk paths, key material, salts used for HKDF, HMAC values, stack traces, or secrets.
- Frontend data is inserted with safe DOM APIs such as `textContent`, not unsanitized `innerHTML`.

### US-05 Restore an owned file

As an authenticated owner, I want to download the decrypted original so that the restored bytes match the uploaded bytes.

**Acceptance criteria:**

- The owner check occurs before reading or decrypting the file.
- HMAC is verified before decryption.
- HMAC comparison uses `crypto.timingSafeEqual` after validating lengths.
- Tampered envelopes receive a generic integrity failure and no plaintext.
- The restored file SHA-256 and byte length match the original metadata.
- `Content-Disposition` is safe and includes a sanitized original filename.
- Another user receives 404 or 403 consistently without learning whether a given file ID exists.

### US-06 Download owned ciphertext

As an authenticated owner, I want to download the encrypted envelope so that I can inspect or demonstrate encrypted-at-rest data.

**Acceptance criteria:**

- Only the owner may download it.
- Response content is the stored versioned envelope, not plaintext.
- Internal disk path is not exposed.

### US-07 Delete an owned file

As an authenticated owner, I want to delete my file so that unnecessary personal data is no longer retained.

**Acceptance criteria:**

- Owner authorization is enforced.
- Metadata and encrypted file are both removed.
- Missing physical files are handled safely and do not permit deleting another user's metadata.
- Partial failure is surfaced and logged without leaking secrets.

### US-08 Run cipher comparison

As a project evaluator, I want reproducible AES, DES, and RC4 measurements using identical fixtures so that I can compare practical behavior rather than present isolated numbers.

**Acceptance criteria:**

- Benchmark is not run implicitly during normal upload.
- It can be launched from a documented local command.
- Four dummy fixtures are used.
- Each fixture-algorithm combination has one warm-up and ten measured iterations.
- Every iteration encrypts, authenticates, verifies, decrypts, and checks correctness.
- A correctness failure marks or aborts that measurement; it must never be reported as success.
- Real JSON and CSV files are generated.
- UI summary reads generated results or obtains them from an API; values are not copied into source code.

---

## 7. Functional Requirements

### FR-01 Application branding

Replace user-facing CipherDock branding with CampusVault in README, package metadata, HTML title, page headings, descriptions, and UI copy.

The main description must communicate:

> CampusVault adalah aplikasi penyimpanan privat untuk dokumen organisasi kampus. Isi file dienkripsi sebelum disimpan. AES digunakan sebagai pilihan utama, sedangkan DES dan RC4 tersedia hanya untuk perbandingan akademik.

### FR-02 Database schema

Use versioned SQL migrations. Do not depend solely on `CREATE TABLE IF NOT EXISTS` embedded in server startup.

Minimum conceptual schema:

```text
users
- id
- username (unique)
- password_hash
- created_at

sessions
- generated by the selected session store or managed securely by the session library

files
- id
- owner_id (foreign key -> users.id)
- original_filename
- storage_filename (unique random value)
- mime_type
- original_size_bytes
- encrypted_size_bytes
- algorithm: AES | DES | RC4
- mode: CBC | STREAM
- envelope_version
- original_sha256
- created_at
```

Do not store encryption keys in SQLite. Do not store a client-provided username as the ownership authority.

### FR-03 Session authentication

Use a maintained Express-compatible server-session middleware and a SQLite-compatible session store or another local persistent server-side store. Do not use the default in-memory session store as the final implementation.

Required controls:

- secret from environment;
- `HttpOnly` cookie;
- `SameSite=Lax`;
- reasonable idle expiration documented in `.env.example` or config;
- `Secure` when production mode is enabled;
- session regeneration on login;
- destruction on logout;
- authentication middleware for all private endpoints.

### FR-04 Password handling

- Use `crypto.scrypt` with a per-password random salt.
- Store a versioned password-hash string so parameters can be changed later.
- Use `crypto.timingSafeEqual` for derived-key comparison.
- Define documented minimum and maximum password lengths.
- Reject excessively long input before expensive hashing to reduce denial-of-service risk.
- Do not migrate the legacy plaintext account. Start with a clean database.

### FR-05 File ownership

Every private file route must derive the current user from the server session and query using owner scope.

Routes must behave conceptually as follows:

```text
GET    /api/files
POST   /api/files
GET    /api/files/:id/download
GET    /api/files/:id/ciphertext
DELETE /api/files/:id
```

Exact naming may differ if it remains internally consistent and documented. Remove or disable `/api/decrypt-external`.

### FR-06 Upload validation

Allowed file categories:

```text
Personal structured data:
- .csv

Identity scans and images:
- .pdf
- .jpg
- .jpeg
- .png

Office documents:
- .pdf
- .docx
- .xlsx
- .pptx

Video:
- .mp4
- .webm
```

Controls:

- 25 MiB maximum;
- extension allowlist;
- MIME allowlist;
- magic-byte/file-signature validation where practical;
- reject disagreement between extension, MIME, and detectable signature;
- sanitize display filename;
- random storage filename;
- do not render uploaded documents in the browser;
- do not serve storage directories statically.

### FR-07 Cryptography service abstraction

Move cryptography out of monolithic route handlers. Implement a clear adapter contract, for example:

```text
encrypt(buffer, context) -> envelope
verifyAndDecrypt(envelope, context) -> buffer
```

Required adapters:

- AES-256-CBC;
- single DES-CBC;
- RC4.

All adapters must consume and return byte-safe data. Algorithm-specific behavior must be covered by tests.

### FR-08 Key derivation

Load a high-entropy master secret from an environment variable such as `CAMPUSVAULT_MASTER_KEY`.

Requirements:

- no key literal in source, tests, fixtures, README, database, or committed `.env`;
- provide `.env.example` containing variable names and generation guidance, never real values;
- derive separate keys with HKDF-SHA-256 and explicit domain-separation labels;
- use distinct labels for AES encryption, AES MAC, DES encryption, DES MAC, RC4 encryption, and RC4 MAC;
- bind file-specific context, such as a random envelope salt, into HKDF;
- encryption key and MAC key must not be identical;
- do not derive file encryption from the user's login password;
- fail startup with a clear safe error if the required secret is missing or malformed.

Suggested conceptual labels:

```text
campusvault:v1:aes:enc
campusvault:v1:aes:mac
campusvault:v1:des:enc
campusvault:v1:des:mac
campusvault:v1:rc4:enc
campusvault:v1:rc4:mac
```

The exact serialization and key lengths must be documented and tested.

### FR-09 AES

- Algorithm: AES-256-CBC.
- Key: 32 bytes from HKDF.
- IV: new random 16-byte value per encryption.
- Padding: PKCS#7 through the selected maintained library/runtime.
- Integrity: HMAC-SHA-256 encrypt-then-MAC.
- Never use ECB.

### FR-10 DES

- Algorithm: actual single DES in CBC mode.
- Key material: valid 8-byte DES key derived from HKDF, accounting for the selected library's expected representation.
- IV: new random 8-byte value per encryption.
- Padding: PKCS#7.
- Integrity: HMAC-SHA-256 encrypt-then-MAC.
- Never use ECB.
- Do not substitute DES-EDE, 2-key 3DES, or 3-key 3DES.
- The selected package and its reason must be documented.
- UI and README must label DES insecure and academic-only.

### FR-11 RC4

- Use an isolated RC4 implementation from a reviewed dependency or a compact module whose tests use recognized test vectors.
- Use a derived per-file encryption key, not a shared passphrase string.
- Do not use CryptoJS's legacy OpenSSL-format passphrase KDF as the new format.
- Integrity: HMAC-SHA-256 encrypt-then-MAC.
- UI and README must label RC4 insecure and academic-only.

### FR-12 Versioned encryption envelope

Store a UTF-8 JSON object. Minimum logical fields:

```json
{
  "version": 1,
  "algorithm": "AES",
  "mode": "CBC",
  "kdf": "HKDF-SHA256",
  "salt": "base64",
  "iv": "base64-or-null",
  "ciphertext": "base64",
  "hmac": "base64"
}
```

Requirements:

- field names and canonical MAC input must be documented;
- the HMAC must authenticate all security-relevant fields except the HMAC field itself;
- fields covered by HMAC must include version, algorithm, mode, salt, IV, and ciphertext;
- use deterministic canonical serialization for MAC input, or construct a length-delimited binary MAC payload;
- reject unknown versions, algorithms, modes, missing fields, invalid Base64, invalid lengths, oversized envelopes, and extra values that create ambiguity;
- verify HMAC before decrypting;
- do not trust the database algorithm field over the authenticated envelope;
- database metadata and authenticated envelope must be checked for consistency.

### FR-13 Original-file correctness

At upload:

- calculate SHA-256 of original bytes;
- store original byte length and SHA-256 in metadata;
- encrypt and persist the versioned envelope.

At restore:

- authorize owner;
- parse and validate envelope;
- verify HMAC;
- decrypt;
- compare byte length and SHA-256;
- return plaintext only if all checks pass.

SHA-256 correctness checking does not replace HMAC authentication.

### FR-14 Storage consistency and cleanup

Implement fail-safe storage behavior:

1. write temporary plaintext only if required by the upload middleware;
2. read/process it safely;
3. write envelope to a newly generated temporary ciphertext path;
4. complete the metadata transaction;
5. atomically rename ciphertext into its final location;
6. remove temporary files in `finally` blocks;
7. compensate or roll back if database or filesystem steps fail.

An equivalent ordering is acceptable if tests prove that it cannot leave exposed plaintext and minimizes orphaned metadata/files.

### FR-15 Benchmark runner

Provide a documented command, for example:

```bash
npm run benchmark
```

Benchmark configuration:

- four dummy fixtures;
- AES, DES, and RC4 tested on identical bytes;
- one warm-up per fixture-algorithm pair;
- ten measured iterations;
- rotate or deterministically shuffle algorithm order to reduce order bias;
- use a monotonic high-resolution timer;
- measure the defined cryptographic pipeline consistently;
- do not include HTTP/network, browser rendering, database operations, or final filesystem writes;
- include encryption, HMAC generation, HMAC verification, and decryption consistently because integrity is part of the implemented protection pipeline;
- key derivation treatment must be consistent across algorithms and explicitly recorded in benchmark metadata;
- verify byte equality and SHA-256 every iteration.

Each detailed result must contain at least:

```text
fixture name
fixture category
MIME type
original size in bytes
original SHA-256
algorithm
mode
iteration number
warm-up/measured indicator
encryption-plus-MAC time in milliseconds
verification-plus-decryption time in milliseconds
total crypto time in milliseconds
encrypted envelope size in bytes
overhead bytes
overhead percentage
encryption throughput in MiB/s
decryption throughput in MiB/s
round-trip success
runtime version
OS/platform
CPU model if obtainable locally
timestamp
```

Aggregate per fixture and algorithm:

- mean;
- median;
- minimum;
- maximum;
- sample standard deviation;
- success count;
- failure count.

Generated output locations should be predictable, such as:

```text
benchmark/results/latest.json
benchmark/results/latest.csv
```

Do not commit fabricated result values. It is acceptable to commit an empty output directory marker, schemas, or example structure explicitly labeled as non-measurement. Real results may be committed only after the group runs the benchmark and verifies the environment metadata.

### FR-16 Benchmark UI

Provide a local page or dashboard section that:

- explains methodology;
- displays the latest generated aggregate results if they exist;
- clearly shows file, algorithm, encryption time, decryption time, throughput, encrypted size, overhead, and correctness;
- does not contain hard-coded performance numbers;
- shows an empty-state instruction when no benchmark has been run.

### FR-17 Security baseline

Implement:

- `helmet` or equivalent security headers;
- disable `X-Powered-By`;
- authentication rate limit;
- reasonable upload/API rate limit;
- CSRF protection compatible with the server-side cookie session;
- safe origin behavior for local same-origin frontend/API;
- request body size limits;
- generic client error messages and detailed server logs without secrets;
- no unsanitized HTML interpolation;
- dependency audit reviewed after upgrades.

Do not add permissive CORS unless a concrete cross-origin requirement exists.

### FR-18 Logging

Log only operational events needed for debugging and demonstration:

- registration success/failure category;
- login success/failure category;
- upload success/failure;
- download/decrypt success/failure;
- delete success/failure;
- integrity verification failure.

Never log:

- password;
- session cookie or session ID;
- master key or derived keys;
- plaintext file contents;
- HMAC value;
- complete personal filename when avoidable;
- stack trace in the HTTP response.

---

## 8. Non-Functional Requirements

### NFR-01 Correctness

- AES, DES, and RC4 must restore every supported binary fixture byte-for-byte.
- Tampering with any authenticated field must cause rejection before plaintext release.
- Unknown algorithms and envelope versions must fail closed.

### NFR-02 Security

- No private endpoint may depend on client-supplied identity.
- No secret or real personal document may be tracked by Git.
- No storage directory may be exposed as Express static content.
- No ECB implementation or fallback is permitted.

### NFR-03 Reproducibility

A clean clone must support a documented sequence equivalent to:

```bash
npm ci
cp .env.example .env
npm run migrate
npm test
npm start
```

The README must explain how to generate local secrets without including actual secret values.

### NFR-04 Maintainability

Separate at minimum:

- configuration;
- database/migrations;
- authentication;
- authorization;
- storage;
- cryptography/envelope;
- routes/controllers;
- benchmark;
- tests.

Do not retain the entire application in one monolithic `server.js`.

### NFR-05 Performance safety

- Enforce the 25 MiB limit before unrestricted processing.
- Avoid unnecessary duplicate conversions between Buffer, hex, Base64, and strings.
- Streaming is preferred where compatible with the chosen authenticated-envelope design, but the implementation must prioritize correctness and bounded 25 MiB behavior.
- Synchronous CPU-heavy or disk-heavy work must not be used without acknowledging its impact. For this local academic scope, bounded processing is acceptable if tests demonstrate the limit works.

### NFR-06 User experience

- Indonesian UI copy.
- Clear empty states and safe errors.
- Visible cipher warning for DES and RC4.
- Upload form shows the 25 MiB limit and accepted types.
- Do not claim that the product is production-ready or legally compliant.

---

## 9. API Behavior

The exact response schema may be refined, but all endpoints must have consistent JSON error shapes.

Suggested response:

```json
{
  "error": {
    "code": "INTEGRITY_CHECK_FAILED",
    "message": "File tidak dapat dipulihkan karena pemeriksaan integritas gagal."
  }
}
```

Minimum status behavior:

- `200` successful read/download/login/logout where appropriate;
- `201` registration and successful upload;
- `400` malformed validation input;
- `401` unauthenticated;
- `403` CSRF failure or explicitly forbidden behavior;
- `404` owned resource absent or inaccessible, applied consistently to reduce enumeration;
- `409` username conflict;
- `413` file larger than 25 MiB;
- `415` unsupported or mismatched file type;
- `422` malformed envelope where appropriate;
- `429` rate-limited;
- `500` unexpected internal error without stack trace or secret leakage.

Integrity failure may use `400` or `422`, but the choice must be consistent and tested.

---

## 10. Required Test Plan

Use an automated test framework appropriate for Node/Express and temporary isolated directories/databases. Tests must never modify committed runtime data.

### 10.1 Authentication tests

- register succeeds with valid input;
- duplicate username rejected;
- invalid username rejected;
- weak/too-short and excessively long password rejected according to documented policy;
- password is not stored as plaintext;
- valid login succeeds;
- invalid login fails generically;
- session cookie has required flags;
- session rotates on login;
- logout invalidates session;
- protected endpoints return 401 without session;
- rate limit activates under configured test conditions.

### 10.2 Authorization tests

Create User A and User B:

- A can list A's files;
- B cannot see A's files in listing;
- B cannot download A's plaintext;
- B cannot download A's ciphertext;
- B cannot delete A's file;
- manipulating file ID does not bypass ownership;
- request body/query username cannot impersonate another owner.

### 10.3 Upload tests

- each allowlisted category succeeds with safe dummy bytes;
- unsupported extension rejected;
- mismatched MIME/signature rejected when detectable;
- file above 25 MiB rejected;
- malicious filename does not escape storage or execute in UI;
- duplicate original filenames do not overwrite stored files;
- encryption error cleans temporary plaintext;
- database failure does not leave unsafe plaintext;
- unsupported algorithm fails closed.

### 10.4 Cryptography contract tests

For AES, DES, and RC4:

- recognized test vector where available;
- empty buffer behavior explicitly decided and tested;
- small text buffer round-trip;
- binary buffer round-trip;
- all four benchmark fixtures round-trip;
- repeated encryption of same content produces different ciphertext due to random per-file salt/IV or key context;
- HMAC verifies valid envelope;
- changed version rejected;
- changed algorithm rejected;
- changed mode rejected;
- changed salt rejected;
- changed IV rejected where present;
- changed ciphertext rejected;
- changed HMAC rejected;
- truncated/invalid Base64 rejected;
- wrong master key rejected;
- no plaintext returned on any integrity failure;
- HMAC verification occurs before decryption, tested through mocks/spies or architecture-level assertions.

### 10.5 File correctness tests

- saved original SHA-256 equals uploaded bytes;
- downloaded SHA-256 equals uploaded SHA-256;
- downloaded size equals original size;
- PDF, Office ZIP-based formats, images, CSV, MP4, and WebM remain byte-identical.

### 10.6 Benchmark tests

- warm-up rows excluded from aggregates;
- ten measured rows per fixture-algorithm pair;
- same fixture hash used for all algorithms;
- mean/median/min/max/sample standard deviation calculations tested with deterministic sample data;
- throughput and overhead formulas tested;
- JSON schema valid;
- CSV columns complete;
- correctness failure is visible and never counted as success;
- UI empty state works without result files;
- UI displays generated data without hard-coded metrics.

### 10.7 Frontend security tests

- filename containing HTML/script characters is displayed as text;
- authentication state is obtained from server, not trusted from a standalone JS variable;
- DES/RC4 warning is visible;
- external decrypt UI is absent;
- private controls are unavailable after logout/reload without valid session.

---

## 11. Benchmark Formula Definitions

Use units consistently and document them in output.

```text
overhead_bytes = encrypted_envelope_size_bytes - original_size_bytes

overhead_percentage =
  (overhead_bytes / original_size_bytes) * 100

throughput_MiB_per_second =
  (original_size_bytes / 1,048,576) / elapsed_seconds
```

For an empty file, overhead percentage and throughput require explicitly defined handling to avoid division by zero. Empty files may be rejected by upload validation if documented, or benchmark statistics may store those values as `null`.

Use sample standard deviation for multiple measured iterations and label the field accordingly.

Interpretation in UI/docs must cover:

- lower time or higher throughput means faster processing in the measured environment;
- larger envelope size indicates storage overhead;
- successful round-trip and integrity rejection are correctness requirements, not optional performance metrics;
- results apply only to the recorded machine/runtime/fixtures;
- AES is the recommended algorithm for this prototype;
- DES and RC4 results do not make either algorithm safe for real deployment.

---

## 12. Dummy Benchmark Fixtures

Create or document generation of four non-sensitive fixtures. Do not use real identity information.

1. **Personal data CSV**
   - synthetic names or obvious placeholders;
   - no real student ID, phone number, email, or address;
   - category: personal structured data.

2. **Dummy identity scan**
   - clearly marked `DUMMY` or `SAMPLE`;
   - contains no real identity number or portrait;
   - PDF, PNG, or JPG.

3. **Office document**
   - synthetic proposal or financial-report content;
   - DOCX or PDF;
   - no real signatures or account details.

4. **Video**
   - short synthetic or self-created MP4/WebM;
   - no identifiable person or licensed third-party media;
   - below 25 MiB.

Each fixture must have a manifest entry with filename, category, MIME type, byte size, and SHA-256.

If binary fixtures would make the repository unnecessarily large, provide a deterministic local fixture-generation script and commit only safe, compact inputs.

---

## 13. Privacy and Security Copy Required in UI

The interface must include concise statements equivalent to:

- “Gunakan hanya data dummy untuk demonstrasi.”
- “AES-CBC digunakan sebagai pilihan utama pada prototipe ini.”
- “DES dan RC4 tersedia hanya untuk eksperimen akademik dan tidak aman untuk penggunaan nyata.”
- “CampusVault adalah prototipe akademik lokal, bukan layanan produksi atau klaim kepatuhan hukum.”

Do not state that encryption alone guarantees compliance with UU PDP or GDPR.

---

## 14. Repository Hygiene and Secret Remediation

### 14.1 Required cleanup

- Add `.gitignore` before normal development continues.
- Ignore `.env`, runtime SQLite files, upload/temp directories, encrypted runtime storage, benchmark generated outputs if measurements should remain machine-specific, logs, coverage, and `node_modules`.
- Remove tracked `node_modules`.
- Remove committed runtime databases, plaintext files, and ciphertext.
- Create clean empty runtime directories at application start or through documented setup.
- Replace real data with dummy fixture generation.
- Remove the compromised hard-coded key from code.
- Generate a new local secret after history cleanup.

### 14.2 History rewrite safety

Because history rewriting affects collaborators, the agent must not force-push automatically unless explicitly provided credentials and instructed to do so. The implementation should:

1. prepare the repository cleanup;
2. document exact coordinated rewrite commands using an appropriate Git history tool;
3. list paths/secrets to purge without printing secret values;
4. explain that all collaborators must re-clone or carefully reset after the rewrite;
5. verify with `git log --all`, `git grep`, and a secret scan;
6. treat the old key as permanently compromised.

Local implementation commits may proceed after working-tree cleanup, but sensitive history must be resolved before final submission.

---

## 15. Implementation Milestones

The agent must implement in the order below unless an explicit dependency requires a small adjustment.

### Milestone 0 — Preserve evidence and establish baseline

- Re-run read-only status, tests, and structure inspection.
- Record baseline in a short implementation log.
- Do not copy sensitive values into the log.
- Confirm no uncommitted collaborator work will be overwritten.

**Exit criteria:** baseline and changed-file plan documented.

### Milestone 1 — Repository stabilization

- Add `.gitignore`.
- Remove tracked generated/runtime data from the current tree.
- Reset to a clean database strategy.
- Add `.env.example`.
- Introduce config validation.
- Update dependencies deliberately.
- Add scripts for start, development, migration, test, lint if a linter is selected, and benchmark.

**Exit criteria:** `npm ci` works from a clean checkout environment; no secret or runtime data is required from Git.

### Milestone 2 — Modular architecture and migrations

- Split monolithic server responsibilities.
- Add versioned migrations.
- Create clean users/files schema with foreign keys enabled.
- Add temporary test database support.

**Exit criteria:** migration up from empty database succeeds repeatedly in clean environments.

### Milestone 3 — Authentication

- Implement registration, login, session, authenticated-user endpoint, and logout.
- Fix frontend registration/login behavior.
- Add password and session tests.

**Exit criteria:** private API returns 401 without valid session; logout invalidates access.

### Milestone 4 — Owner authorization

- Replace username-scoped APIs with session user ID.
- Add owner-aware queries and centralized authorization helper/middleware.
- Add two-user IDOR tests.

**Exit criteria:** User B cannot observe, restore, download, or delete User A's files.

### Milestone 5 — Safe upload/storage

- Add allowed type policy and 25 MiB limit.
- Randomize physical names.
- Ensure cleanup/compensation on every error path.
- Stop serving any storage directory statically.

**Exit criteria:** supported dummy files accepted; oversized/mismatched types rejected; no temporary plaintext remains after tests.

### Milestone 6 — Cryptography envelope and key derivation

- Implement config master key.
- Implement HKDF domain separation.
- Define canonical authenticated envelope format.
- Implement HMAC-first verification.

**Exit criteria:** envelope parser rejects malformed/tampered data before adapter decryption.

### Milestone 7 — AES, DES, and RC4 adapters

- Implement AES-256-CBC.
- Select and implement actual single DES-CBC package.
- Implement RC4 without legacy passphrase KDF.
- Add test vectors and round-trip tests.

**Exit criteria:** all algorithms pass binary round-trip and tampering tests; dependency inspection proves DES is not 3DES.

### Milestone 8 — File operations and frontend

- Implement upload, list, plaintext download, ciphertext download, and delete.
- Remove external decrypt.
- Apply branding and privacy/security warnings.
- Remove unsafe `innerHTML` interpolation.

**Exit criteria:** complete owner workflow succeeds from UI; second user cannot access it.

### Milestone 9 — Benchmark

- Add four safe fixtures or fixture generator.
- Add benchmark runner, aggregation, JSON, and CSV.
- Add UI summary and empty state.
- Add statistical calculation tests.

**Exit criteria:** benchmark produces structurally valid real output and all iterations report round-trip correctness.

### Milestone 10 — Hardening

- Add security headers, CSRF protection, rate limits, safe error handling, and dependency updates.
- Run dependency audit and document accepted residual risks.

**Exit criteria:** security tests pass; no critical dependency issue remains without explicit documented reason.

### Milestone 11 — Documentation and final verification

- Rewrite README for CampusVault.
- Document architecture, crypto choices, threat boundaries, setup, tests, benchmark methodology, and demo.
- Run complete clean-clone verification.

**Exit criteria:** another group member can follow README from a clean clone and reproduce tests and benchmark without private information.

---

## 16. Definition of Done

The project is complete only when all conditions below are satisfied:

- [ ] User-facing name is CampusVault.
- [ ] No real personal data, runtime DB, secrets, plaintext upload, ciphertext runtime file, or `node_modules` is tracked.
- [ ] Fresh `npm ci` succeeds.
- [ ] Empty-database migration succeeds.
- [ ] Register, login, session restore, and logout work.
- [ ] Every private file API requires authentication.
- [ ] Every file lookup is owner-scoped.
- [ ] AES-256-CBC works with random IV and HMAC-SHA-256.
- [ ] Single DES-CBC works with random IV and HMAC-SHA-256.
- [ ] RC4 works with a per-file derived key and HMAC-SHA-256.
- [ ] ECB is absent.
- [ ] Encryption and MAC keys are distinct and derived via HKDF.
- [ ] Master secret is loaded from environment and absent from history after remediation.
- [ ] Tampering with any authenticated envelope field is rejected before decryption.
- [ ] Restored files are byte-identical to uploads.
- [ ] CSV, identity scan, office document, and video fixtures are supported.
- [ ] Files larger than 25 MiB are rejected.
- [ ] Temporary plaintext is removed on success and failure.
- [ ] Ciphertext download is owner-only.
- [ ] External decrypt is removed.
- [ ] Owner can delete an owned file.
- [ ] DES and RC4 warnings are visible.
- [ ] Benchmark uses identical inputs, one warm-up, and ten measured iterations.
- [ ] Benchmark JSON and CSV are generated from execution.
- [ ] Benchmark reports encryption/decryption timing, throughput, size overhead, and correctness.
- [ ] Automated tests cover auth, IDOR, upload validation, algorithms, tampering, cleanup, and benchmark calculations.
- [ ] `npm test` passes.
- [ ] README supports clean local setup and demo.
- [ ] No invented benchmark values or compliance claims appear anywhere.

---

## 17. Agent Execution Protocol

The coding agent must follow this protocol.

### 17.1 General behavior

1. Read this entire PRD before editing.
2. Inspect the current repository and map requirements to actual files.
3. Preserve useful UI styling and working behavior where compatible.
4. Work milestone by milestone.
5. Run relevant tests after each milestone.
6. Make small, meaningful commits if commit permission is available.
7. Never commit secrets, runtime data, benchmark fabrication, or real personal files.
8. Do not claim completion when acceptance criteria fail.
9. When a library choice is required, inspect exact behavior and add a test proving it.
10. Prefer minimal architecture that satisfies this PRD over unrelated refactoring.

### 17.2 Mandatory progress format

Before changing code for a milestone, output:

```text
Milestone:
Current findings:
Files to change:
Acceptance tests to run:
Risks:
```

After the milestone, output:

```text
Completed:
Files changed:
Commands run:
Test results:
Remaining issues:
Next milestone:
```

### 17.3 Failure handling

- If a command fails, diagnose the actual error before changing unrelated files.
- Do not bypass a security check merely to make a test pass.
- Do not replace DES with 3DES.
- Do not disable HMAC validation on restore.
- Do not weaken file ownership checks.
- Do not use `npm audit fix --force` without reviewing breaking changes.
- Do not silently continue after failed migrations or tests.
- If repository data appears personal, stop printing it and report only the path and category.

### 17.4 Commit guidance

Use focused commit messages, for example:

```text
chore: remove tracked runtime data and add gitignore
feat(auth): add persistent server-side sessions
feat(files): enforce owner-scoped file access
feat(crypto): add versioned authenticated envelope
feat(crypto): implement aes-cbc adapter
feat(crypto): implement des-cbc academic adapter
feat(crypto): implement rc4 academic adapter
feat(benchmark): add reproducible cipher benchmark
fix(ui): remove unsafe filename rendering
security: add csrf rate limiting and headers
test: cover idor tampering and upload cleanup
docs: rewrite setup and benchmark methodology
```

Do not combine all implementation into one “final update” commit.

---

## 18. Required README Content

The final README must contain:

1. CampusVault scenario and intended users.
2. Explicit dummy-data-only warning.
3. Feature list.
4. Architecture diagram in Mermaid or text.
5. Prerequisites with exact supported Node version.
6. Clean installation instructions.
7. Environment-variable documentation without values.
8. Migration and startup commands.
9. Supported file formats and 25 MiB limit.
10. Authentication and owner-only access explanation.
11. Encryption envelope and key derivation summary.
12. AES-CBC, DES-CBC, and RC4 decisions.
13. Explicit warning that DES and RC4 are insecure legacy algorithms.
14. Integrity verification explanation.
15. Test commands.
16. Benchmark method, fixture manifest, and commands.
17. Explanation that benchmark values depend on the recorded environment.
18. Local demo flow.
19. Known limitations and out-of-scope list.
20. UU PDP/GDPR discussion framed as design rationale, not compliance certification.
21. Team contribution/commit guidance if appropriate for the assignment.

---

## 19. Final Verification Commands

Adapt exact commands to the final scripts, but the final verification must cover:

```bash
npm ci
npm run migrate
npm test
npm run lint
npm run benchmark
npm start
npm audit --omit=dev
```

Also verify:

```bash
git status --short
git ls-files
```

The final agent report must include:

- pass/fail for each command;
- test count from the test runner;
- remaining dependency findings;
- remaining known limitations;
- files intentionally not committed;
- confirmation that benchmark output came from execution;
- confirmation that no sensitive values were printed.

---

## 20. Final Deliverables

The completed repository must contain, at minimum:

- application source code;
- modular authentication, storage, and cryptography services;
- versioned migration files;
- `.gitignore`;
- `.env.example`;
- package scripts;
- automated tests;
- four safe fixture definitions or deterministic fixture generator;
- benchmark runner;
- benchmark JSON/CSV schema and generated real results after execution;
- updated CampusVault UI;
- rewritten README;
- history-remediation instructions;
- no real personal data or secrets.

The two-page academic report may use the generated results later, but the coding agent must not invent the report's measurements or conclusions.
