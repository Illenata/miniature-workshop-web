# Build context: repository root (see docker-compose.yml).

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/contract/package.json packages/contract/
RUN npm ci --workspace @mw/web --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/contract packages/contract
COPY apps/web apps/web
RUN npm run build --workspace @mw/web

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/contract/package.json packages/contract/
RUN npm ci --omit=dev --workspace @mw/web && npm cache clean --force
COPY --from=build /app/apps/web/build apps/web/build

WORKDIR /app/apps/web
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/gallery').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["npx", "react-router-serve", "./build/server/index.js"]
