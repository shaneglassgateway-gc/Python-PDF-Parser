# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/build-api ./build-api
COPY --from=builder /app/dist ./dist
ENV NODE_ENV=production
ENV PORT=3002
EXPOSE 3002
CMD ["node", "build-api/server.js"]
