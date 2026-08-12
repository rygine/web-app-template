# Pinned to the minor while the zip API the workers use is experimental, so a
# Node bump is a deliberate edit verified by `yarn test:e2e:docker`.
FROM node:26.8-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app
RUN npm i -g corepack && corepack enable
# Only what an install reads, so editing a migration or a config file does not
# reinstall every dependency. The cache mount keeps fetched tarballs across
# builds and between the two install stages.
COPY package.json yarn.lock .yarnrc.yml ./

FROM base AS build
RUN --mount=type=cache,target=/app/.yarn/cache yarn install --immutable
COPY prisma.config.ts tsconfig.json vite.config.ts postcss.config.cjs ./
COPY public ./public
COPY src ./src
RUN yarn build:image

FROM base AS prod-deps
RUN --mount=type=cache,target=/app/.yarn/cache yarn workspaces focus --production

FROM node:26.8-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    LOGS_DIR=/logs
WORKDIR /app
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build     /app/.output      ./.output
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY src/app/server/utils/database.ts ./src/app/server/utils/database.ts
COPY src/app/schema.prisma            ./src/app/schema.prisma
# Job workers are forked as files at run time, so they are copied rather than
# bundled. A worker in a directory nobody copied fails only in the container.
COPY src/app/server/jobs/workers ./src/app/server/jobs/workers

EXPOSE 3000
HEALTHCHECK --start-period=20s --start-interval=2s --interval=10s \
  --timeout=3s --retries=3 CMD \
  node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
USER node
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node .output/server/index.mjs"]
