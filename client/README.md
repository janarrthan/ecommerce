# Storefront client

React and TypeScript client built with Vite. React Router owns browser navigation; TanStack Query will own fetched
server state. CSS Modules scope component styles; global CSS supplies shared design values and document defaults.
Vitest, jsdom, and React Testing Library test components.

## Architecture

Use Feature-Based Architecture. Business code belongs under `src/features/auth`, `src/features/catalog`, and
`src/features/cart`, with each feature owning its API functions, schemas, query hooks, components, pages, styles, and
tests. `src/app` composes features and owns providers, routing, and layouts. `src/shared` contains reusable
infrastructure and domain-independent UI; it does not import features or application setup.

Consume features through their public `index.ts` entry points and keep dependencies free of cycles. Feature tests
belong under the owning feature's `tests/` directory, application tests under `src/app/tests`, and global test setup
under `src/test`. Follow the target tree and ownership rules in
[Planning the New Storefront Client](../guides/planning-the-new-storefront-client.md).

## Local setup

Use a Node version supported by the installed Vite and other packages, then run `npm ci`. Copy `.env.example` to
`.env.local` if the API proxy target needs to change. Run `npm run dev` to start Vite. The server must be running
separately for API calls. Environment files must not contain browser secrets.

## Checks

Run `npm run format:check`, `npm run lint`, `npm run typecheck`, and `npm run build`. Run `npm test` for component
tests.

## Deployment boundary

The development `/api` proxy is not a production proxy. Hosting must forward `/api` requests to the backend and
serve the SPA entry point for client routes, with session cookies and security settings configured for the actual
deployment. The current shell does not implement storefront, authentication, cart, checkout, or payment workflows.
