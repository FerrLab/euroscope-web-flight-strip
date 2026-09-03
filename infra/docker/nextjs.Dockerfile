# Production frontend image. Next.js's `output: 'standalone'` (see
# apps/web/next.config.mjs) traces only the files apps/web actually needs
# at runtime, so the final image doesn't carry the whole pnpm workspace.
#
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, not
# read at container start — pass the real production values as build args.

FROM node:22-alpine AS builder
WORKDIR /repo
RUN corepack enable

# Whole workspace: libs/design-tokens and libs/api-client generate files
# straight into their own src/ (no separate dist/ step — see their nx
# "build" targets), so there's no clean way to install deps from just
# package.json manifests before the rest of the source is present.
COPY . .
RUN pnpm install --frozen-lockfile

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_GATEWAY_BASE_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_GATEWAY_BASE_URL=${NEXT_PUBLIC_GATEWAY_BASE_URL}
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm nx build design-tokens \
    && pnpm nx build api-client \
    && pnpm nx build web

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
