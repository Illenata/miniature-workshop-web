# Build context: repository root (see docker-compose.yml).

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/contract/package.json packages/contract/
RUN npm ci --workspace @mw/api --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/contract packages/contract
COPY apps/api apps/api
RUN npm run build --workspace @mw/api

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/contract/package.json packages/contract/
RUN npm ci --omit=dev --workspace @mw/api && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/drizzle apps/api/drizzle

# Migrations are read from ./drizzle relative to this directory.
WORKDIR /app/apps/api
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/server.js"]
