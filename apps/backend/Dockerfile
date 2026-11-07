FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
# Present so npm workspaces match the lockfile; mobile is never built here.
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/pijin_core/package.json packages/pijin_core/package.json
RUN npm ci --ignore-scripts --workspace=backend --include-workspace-root

FROM deps AS build
COPY . .
RUN npm run build --workspace=pijin_core
RUN cd apps/backend && npx prisma generate
RUN npm run build --workspace=backend

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=build /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=build /app/apps/backend/prisma.config.ts ./apps/backend/prisma.config.ts
COPY --from=build /app/packages/pijin_core/package.json ./packages/pijin_core/package.json
COPY --from=build /app/packages/pijin_core/dist ./packages/pijin_core/dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/api/docs-json').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "apps/backend/dist/main.js"]
