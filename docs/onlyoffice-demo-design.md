# OnlyOffice Vue Demo - Requirements & Architecture

## Business Goals
- Validate integration between an existing OnlyOffice Document Server instance and a custom application UI.
- Allow local users to upload Word documents, manage them in a list, edit online via OnlyOffice, and persist updated files to a local directory on the application host.

## Scope & Requirements
### Functional
1. Upload `.docx` (and other Word formats supported by OnlyOffice) from the local machine through the UI.
2. Store uploaded files on the app host's local filesystem (no cloud or remote storage) and keep a file metadata catalog.
3. Show a file list (name, last modified, size) in the UI; allow selecting a file to edit.
4. Launch OnlyOffice editor in the browser for the selected file using the OnlyOffice Document Server integration (`DocsAPI.DocEditor`).
5. Persist user edits by receiving OnlyOffice callbacks and writing the updated content back to the local storage directory.
6. Provide minimal UX feedback for upload, edit launch, and save status.

### Non-Functional & Constraints
- Front-end built with Vue 3 (Vite tooling for dev server/build).
- Use OnlyOffice Document Server APIs without additional cloud services. The Document Server base URL should be configurable (environment variable).
- Operate entirely on a developer workstation (single-node setup) with local filesystem writes.
- Favor clarity and traceability of code over production-hardening.
- Allow enabling OnlyOffice JWT security via environment variables (sign config, verify callbacks).

### Assumptions
- OnlyOffice Document Server is reachable from the front-end via a known base URL (e.g., `http://localhost:8080`).
- JWT security可按需开启，后端通过环境变量自动对配置进行签名并在回调时校验。
- Document Server has access to the file URLs served by our backend; when运行在不同主机上，需要将 `APP_BASE_URL` 指向后端所在机器的实际地址并确保网络可达。
- The demo can run with Node.js (>=18) available locally.

### Open Questions / Follow-ups
- Should we support collaborative editing sessions? (Assumed no for demo.)
- Authentication/authorization for uploads and edits? (Assumed unauthenticated local demo.)
- Maximum file size or count? (Rely on server & browser defaults.)

## High-Level Architecture
```
+-----------------------+        +-----------------------------+
|      Vue Frontend     |        |     Node.js Backend API     |
|  - Upload form        |        |  - File catalog (JSON mem)   |
|  - File list          |        |  - File storage (/storage)   |
|  - OnlyOffice iframe  | <----> |  - OnlyOffice config endpoint|
|  (DocsAPI.DocEditor)  |        |  - Callback handler          |
+-----------------------+        +-----------------------------+
             |                                |
             | DocsAPI.DocEditor config        |
             | (fetch /api/editor/:id)         |
             v                                v
                                     +--------------------------+
                                     | OnlyOffice Document      |
                                     | Server (existing)        |
                                     | - Hosts editor UI        |
                                     | - Sends save callbacks   |
                                     +--------------------------+
```

### Component Responsibilities
- **Frontend (Vue + Vite)**
  - Handle file uploads (`POST /api/files`).
  - Display file metadata from `GET /api/files`.
  - Lazily load OnlyOffice script from Document Server (`${ONLYOFFICE_BASE_URL}/web-apps/apps/api/documents/api.js`).
  - Request editor config (`GET /api/editor/:id`) and instantiate `DocsAPI.DocEditor` within a modal/section.
  - React to save completion events via backend response (polling or websockets unnecessary for demo).

- **Backend (Node.js + Express)**
  - Serve REST endpoints for uploading/listing files.
  - Provide public URLs for stored documents (static file serving from storage directory).
  - Generate OnlyOffice editor config JSON including document `url`, `key`, `title`, `fileType`, and `editorConfig.callbackUrl`.
  - Receive OnlyOffice POST callbacks when document status indicates ready to save (`status == 2`).
  - Download updated document content from `body.url` and overwrite the local file.
  - Maintain simple in-memory index or rescan directory for metadata on each request (acceptable for demo).
  - When JWT is enabled, sign editor config payloads and verify callback tokens before处理。

### Key OnlyOffice API Touchpoints
- Load client script: `${ONLYOFFICE_BASE_URL}/web-apps/apps/api/documents/api.js`.
- Instantiate editor: `new DocsAPI.DocEditor(elementId, config)`.
- Config structure (per OnlyOffice Docs API):
  - `document`: metadata (`fileType`, `key`, `title`, `url`, `permissions`).
  - `editorConfig`: UI & callback configuration (`callbackUrl`, `mode`, `lang`, etc.).
  - `width/height` to control iframe size.
- Callback payload handling: Document Server posts JSON with `status`. For `status` values `2` (document is ready to be saved) and `6` (must force save), use provided `url` to download the latest document version.

## Task Breakdown (Draft)
1. Scaffold project layout (`client/` for Vue app, `server/` for Express backend) with shared `.env` for config.
2. Implement backend:
   - Express app with endpoints: `GET /api/files`, `POST /api/files`, `GET /api/editor/:id`, `POST /api/onlyoffice/callback`.
   - Static serving of `/storage` directory.
   - Utility for generating OnlyOffice document keys and mapping file metadata.
3. Implement Vue frontend:
   - File upload component with drag-and-drop / input.
   - File list view showing metadata and open-in-editor button.
   - Editor container component that loads OnlyOffice script and mounts `DocsAPI.DocEditor` using backend config.
   - Basic state management (Pinia or simple composables) for file list.
4. Provide scripts to run backend (`npm run dev:server`) and frontend (`npm run dev:client`) concurrently, plus instructions.
5. Manual validation instructions (upload/edit/save) documented in README.
