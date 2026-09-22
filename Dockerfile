# syntax=docker/dockerfile:1

# ---- Build stage: install all dependencies and compile TypeScript ----
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
# devOptional packages (TypeScript/ts-node, optional peers of typeorm) need --omit=optional too.
RUN npm run build && npm prune --omit=dev --omit=optional

# ---- Runtime stage: compiled app + production dependencies only ----
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# The official Node image ships an unprivileged "node" user.
USER node
EXPOSE 3000

# DATABASE_URL, APP_TIMEZONE and other settings are provided at run time (never baked in).
CMD ["node", "dist/main.js"]
