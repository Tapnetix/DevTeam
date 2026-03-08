# ---- Build Stage ----
FROM node:20-alpine AS build

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./

# Copy all packages for workspace resolution
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/orchestrator/package.json packages/orchestrator/tsconfig.json ./packages/orchestrator/
COPY packages/slack-bot/package.json packages/slack-bot/tsconfig.json ./packages/slack-bot/
COPY packages/integrations/package.json packages/integrations/tsconfig.json ./packages/integrations/
COPY packages/worker/package.json packages/worker/tsconfig.json ./packages/worker/

# Install all dependencies (workspace-aware)
RUN npm ci

# Copy source code
COPY packages/shared/src ./packages/shared/src
COPY packages/integrations/src ./packages/integrations/src

# Build TypeScript (project references ensure shared is built first)
RUN npx tsc --build packages/integrations/tsconfig.json

# ---- Production Stage ----
FROM node:20-alpine AS production

ENV NODE_ENV=production

WORKDIR /app

# Copy root workspace files for workspace resolution
COPY package.json package-lock.json ./

# Copy package.json for each needed package
COPY packages/shared/package.json ./packages/shared/
COPY packages/integrations/package.json ./packages/integrations/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built output from build stage
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/integrations/dist ./packages/integrations/dist

USER node

EXPOSE 3002

CMD ["node", "packages/integrations/dist/index.js"]
