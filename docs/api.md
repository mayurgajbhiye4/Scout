# API Reference — AI Research Workspace

Base URL: `/api/v1`

All JSON endpoints adhere to the unified envelope conventions:
- **Success**: `{"data": ..., "meta": {...}}`
- **Error**: `{"error": {"code": "...", "message": "...", "details": {...}}}`

---

## 1. Authentication (`/api/v1/auth`)

### Register
- **Endpoint**: `POST /auth/register`
- **Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "name": "Jane Doe"
  }
  ```
- **Response** `(201 Created)`:
  ```json
  {
    "data": {
      "user": {
        "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "email": "user@example.com",
        "name": "Jane Doe",
        "is_active": true
      },
      "access_token": "eyJhbGciOiJIUzI1NiIs...",
      "token_type": "bearer"
    },
    "meta": {}
  }
  ```

### Login
- **Endpoint**: `POST /auth/login`
- **Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Response** `(200 OK)`:
  ```json
  {
    "data": {
      "access_token": "eyJhbGciOiJIUzI1NiIs...",
      "token_type": "bearer"
    },
    "meta": {}
  }
  ```

### Current User
- **Endpoint**: `GET /auth/me`
- **Headers**: `Authorization: Bearer <token>`
- **Response** `(200 OK)`:
  ```json
  {
    "data": {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "email": "user@example.com",
      "name": "Jane Doe",
      "is_active": true,
      "created_at": "2026-08-23T12:00:00Z"
    },
    "meta": {}
  }
  ```

---

## 2. Workspaces (`/api/v1/workspaces`)

### List Workspaces
- **Endpoint**: `GET /workspaces`
- **Response** `(200 OK)`:
  ```json
  {
    "data": [
      {
        "id": "e4b2e8c2-3e28-4e1b-90f7-111111111111",
        "name": "Distributed Systems Research",
        "description": "Comparative study on consensus and replication",
        "created_at": "2026-08-23T12:00:00Z",
        "updated_at": "2026-08-23T12:00:00Z"
      }
    ],
    "meta": {"total": 1}
  }
  ```

### Create Workspace
- **Endpoint**: `POST /workspaces`
- **Body**:
  ```json
  {
    "name": "AI Engineering",
    "description": "Evaluation of RAG and agent architectures"
  }
  ```
- **Response** `(201 Created)`

### Get Workspace
- **Endpoint**: `GET /workspaces/{workspace_id}`
- **Response** `(200 OK)`

### Update Workspace
- **Endpoint**: `PATCH /workspaces/{workspace_id}`
- **Body**: `{"name": "...", "description": "..."}`
- **Response** `(200 OK)`

### Delete Workspace
- **Endpoint**: `DELETE /workspaces/{workspace_id}`
- **Response** `(204 No Content)`

---

## 3. Documents & Sources (`/api/v1/workspaces/{workspace_id}`)

### Ingest Document / URL
- **Endpoint**: `POST /workspaces/{workspace_id}/documents`
- **Body**:
  ```json
  {
    "source_type": "url",
    "url": "https://example.com/research-paper",
    "filename": "Research Paper",
    "metadata": {
      "category": "systems"
    }
  }
  ```
- **Response** `(201 Created)`:
  ```json
  {
    "data": {
      "id": "7b8f9e12-4c3a-4b9e-9d2a-222222222222",
      "workspace_id": "e4b2e8c2-3e28-4e1b-90f7-111111111111",
      "source_type": "url",
      "filename": "Research Paper",
      "status": "pending",
      "url": "https://example.com/research-paper",
      "created_at": "2026-08-23T12:00:00Z"
    },
    "meta": {}
  }
  ```

### List Documents
- **Endpoint**: `GET /workspaces/{workspace_id}/documents`
- **Response** `(200 OK)`

### List Sources
- **Endpoint**: `GET /workspaces/{workspace_id}/sources`
- **Response** `(200 OK)`

### Delete Document
- **Endpoint**: `DELETE /workspaces/{workspace_id}/documents/{document_id}`
- **Response** `(204 No Content)`

---

## 4. Autonomous Research (`/api/v1/workspaces/{workspace_id}/research`)

### Create Research Session
- **Endpoint**: `POST /workspaces/{workspace_id}/research`
- **Body**:
  ```json
  {
    "question": "Compare PostgreSQL pgvector with Pinecone for enterprise multi-tenant RAG systems.",
    "research_depth": "deep"
  }
  ```
- **Response** `(201 Created)`:
  ```json
  {
    "data": {
      "id": "9a1b2c3d-4e5f-6a7b-8c9d-333333333333",
      "workspace_id": "e4b2e8c2-3e28-4e1b-90f7-111111111111",
      "question": "Compare PostgreSQL pgvector with Pinecone...",
      "research_depth": "deep",
      "status": "queued",
      "started_at": null,
      "completed_at": null,
      "error_message": null,
      "created_at": "2026-08-23T12:00:00Z",
      "updated_at": "2026-08-23T12:00:00Z"
    },
    "meta": {}
  }
  ```

### Get Research Status
- **Endpoint**: `GET /workspaces/{workspace_id}/research/{session_id}`
- **Response** `(200 OK)`:
  ```json
  {
    "data": {
      "id": "9a1b2c3d-4e5f-6a7b-8c9d-333333333333",
      "status": "completed",
      "started_at": "2026-08-23T12:00:01Z",
      "completed_at": "2026-08-23T12:00:25Z"
    },
    "meta": {}
  }
  ```

### Get Research Report
- **Endpoint**: `GET /workspaces/{workspace_id}/research/{session_id}/report`
- **Response** `(200 OK)`:
  ```json
  {
    "data": {
      "id": "11223344-5566-7788-99aa-bbccddeeff00",
      "title": "Comparative Analysis: pgvector vs Pinecone",
      "summary": "Key trade-offs between unified SQL storage and managed vector indexes.",
      "content_markdown": "# Executive Summary\n\npgvector provides strong transactional guarantees [1]..."
    },
    "meta": {}
  }
  ```

### Get Research Evidence
- **Endpoint**: `GET /workspaces/{workspace_id}/research/{session_id}/evidence`
- **Response** `(200 OK)`:
  ```json
  {
    "data": [
      {
        "id": "aabbccdd-1122-3344-5566-778899aabbcc",
        "claim": "pgvector supports ACID transactions alongside tabular data.",
        "supporting_excerpt": "PostgreSQL ensures standard ACID compliance across relational rows and vector embeddings.",
        "confidence": 0.95,
        "source_id": "7b8f9e12-4c3a-4b9e-9d2a-222222222222"
      }
    ],
    "meta": {}
  }
  ```

---

## 5. Health Checks (`/health`)

- `GET /health`: Basic liveness check `{"status": "ok"}`
- `GET /health/ready`: Database & embedding provider readiness probe
