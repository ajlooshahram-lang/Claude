FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json ./
RUN npm install --omit=dev

FROM base AS build
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM base AS production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs
COPY --from=deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/dist ./dist
COPY --from=build --chown=nestjs:nodejs /app/package.json ./
USER nestjs
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "dist/main.js"]
