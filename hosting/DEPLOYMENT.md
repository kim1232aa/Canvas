# Deployment adapter

Source: `https://github.com/kim1232aa/Canvas`, commit `a9d46082ea7a37fb4dcabb9a997848900911e803`.

The React application and provider handlers are preserved. The build adapter replaces local filesystem storage with D1/R2, removes local DNS/Undici/socket setup, and exports an Express-backed Worker handler. The original Node entrypoint remains available for local development. CommonJS built-in imports are resolved through explicit ESM imports, while optional native Node addons remain unavailable and use their packages' standard JavaScript paths.

Cloudflare's official Express and Node HTTP documentation was reviewed during implementation:
- https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/

Site access remains owner-private. The application binds the first platform-authenticated visitor as its owner using an atomic insert. A wider Site audience does not grant other users application access. Runtime provider keys can be supplied through the existing settings interface or Site secrets. D1 settings values are encrypted with AES-GCM; the runtime encryption secret must remain stable.

The canvas manager retains its existing device-local save behavior. Cloud project APIs and history use durable storage. Media files are content-addressed in R2, and private media references are converted into inline input bytes before provider requests. Prior R2 project payload revisions are retained so concurrent readers remain valid; a future explicit storage cleanup can reclaim unused revisions and media.

Validation includes TypeScript, the repository's existing tests, and local Worker checks for static assets, authenticated owner access, cross-origin rejection, project save/read/clone/delete, media, history, encrypted settings, key-pool strategy, persistence across a runtime restart, and missing-key/model error paths. No real provider keys or generation calls are used.

Browser UI QA and browser WebMCP runtime validation are unavailable in this deployment workflow. WebMCP registration is feature-detected and cannot block the normal application if unsupported.
