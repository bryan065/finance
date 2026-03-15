# Dockerfile
# ─────────────────────────────────────────────
# Multi-stage build for the fin Next.js app.
#
# Stage 1 (deps)    — install production dependencies
# Stage 2 (builder) — build the Next.js app
# Stage 3 (runner)  — minimal runtime image
#
# Build:  docker build -t fin-app .
# Run:    docker compose up -d
# ─────────────────────────────────────────────

# ── Stage 1: install dependencies ─────────────
FROM node:20-alpine AS deps

# Install libc compat for native modules (sharp, etc.)
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy lockfile and manifest first for layer caching
COPY package.json package-lock.json* ./

RUN npm ci --omit=dev


# ── Stage 2: build ────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy all dependencies (including devDeps for the build)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source
COPY . .

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Build the app
# DATABASE_URL and ANTHROPIC_API_KEY are runtime-only — not needed at build time
RUN npm run build


# ── Stage 3: runtime ──────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser  --system --uid 1001 nextjs

# Copy the standalone output and public assets
COPY --from=builder /app/public            ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone  ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static      ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# next start is provided by the standalone build as server.js
CMD ["node", "server.js"]
