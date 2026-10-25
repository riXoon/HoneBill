FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY packages/pijin_core/package.json packages/pijin_core/package.json
RUN npm ci --ignore-scripts

FROM deps AS build
COPY . .
RUN npm run build --workspace=pijin_core
RUN npx prisma generate --schema=apps/backend/prisma/schema.prisma
RUN npm run build --workspace=backend

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=build /app/apps/backend/prisma ./apps/backend/prisma
EXPOSE 3000
CMD ["node", "apps/backend/dist/main.js"]
