# ── Stage 1: Install dependencies ──────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# libc6-compat is needed for some native modules on Alpine
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* ./
# --ignore-scripts for security, then rebuild native packages explicitly
RUN npm ci --ignore-scripts && \
    npm rebuild sharp && \
    npm cache clean --force

# ── Stage 2: Build the application ────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p /app/public
RUN npm run build

# ── Stage 3: Production runner ────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# System dependencies for document processing + sharp
RUN apk add --no-cache \
    libc6-compat \
    poppler-utils \
    libreoffice \
    fontconfig \
    ttf-freefont \
    && rm -rf /var/cache/apk/*

# Create upload directory
RUN mkdir -p /tmp/uploads

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output (includes serverExternalPackages in node_modules)
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
