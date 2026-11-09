# Apline is smaller than the default node image.
FROM node:22-alpine AS base
# Create a working directory for the app.
WORKDIR /app

# Install Dependencies
FROM base AS deps
# Copy all package*.json files across all workspaces.
COPY package*.json ./
# Reuse cache packages (don't re-install everything)
RUN npm install --ignore-scripts --workspace=backend --include-workspace-root

#Build the backend workspace
FROM deps AS build
COPY . .
RUN npm run build --workspace=pijin_core
RUN cd apps/backend && npx prisma generate
RUN npm run build --workspace=backend

# Final stage: run the application
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
