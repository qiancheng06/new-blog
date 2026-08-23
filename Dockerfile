# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
ARG NEXT_PUBLIC_PERSONA_API_BASE=/persona-api
ARG NEXT_PUBLIC_PERSONA_RUNTIME_MODE=external
ENV NEXT_PUBLIC_PERSONA_API_BASE=${NEXT_PUBLIC_PERSONA_API_BASE}
ENV NEXT_PUBLIC_PERSONA_RUNTIME_MODE=${NEXT_PUBLIC_PERSONA_RUNTIME_MODE}
COPY . .
RUN mkdir -p apps/workspace/public/data \
    && printf '[]\n' > apps/workspace/public/data/projects.json \
    && printf '[]\n' > apps/workspace/public/data/todos.json \
    && printf '[]\n' > apps/workspace/public/data/knowledge.json \
    && npm run build:backend \
    && npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder --chown=node:node /app /app
RUN mkdir -p /app/data /app/backups \
    && chown -R node:node /app/data /app/backups
USER node
EXPOSE 3001 5173
