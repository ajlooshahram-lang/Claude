# ---------------------------------------------------------------------------
# STP Backend — multi-stage production build
# ---------------------------------------------------------------------------

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Generate Prisma client
COPY prisma/ ./prisma/
RUN npx prisma generate

# Compile TypeScript
COPY src/ ./src/
COPY tsconfig.json ./
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: Production
# ---------------------------------------------------------------------------
FROM node:22-alpine AS production

WORKDIR /app

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Install production dependencies only (excludes devDependencies)
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
RUN npm ci --omit=dev

# Generate Prisma client against production node_modules
COPY --from=builder /app/prisma/ ./prisma/
RUN npx prisma generate

# Copy compiled application code
COPY --from=builder /app/dist/ ./dist/

ENV NODE_ENV=production
EXPOSE 8080

# Health check using wget (available on alpine without curl)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --spider http://localhost:8080/health || exit 1

# Run as non-root
USER appuser

CMD ["node", "dist/server.js"]
