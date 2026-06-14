# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma/ prisma/
RUN npx prisma generate

COPY src/ src/
COPY tsconfig.json .
RUN npx tsc -p tsconfig.json

# Stage 2: Runtime
FROM node:22-alpine

RUN addgroup -g 1001 -S qi && adduser -u 1001 -S qi -G qi

WORKDIR /app

COPY --from=builder /app/dist dist/
COPY --from=builder /app/node_modules node_modules/
COPY --from=builder /app/prisma prisma/
COPY package.json .

USER qi

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -q --spider http://localhost:8080/health || exit 1

CMD ["node", "dist/server.js"]
