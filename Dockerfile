# Hazdemy: one container that serves the website and the API on port 4000.
# Build:  docker build -t hazdemy .
# Run:    docker run -p 4000:4000 --env-file server/.env hazdemy
# See docs/PRODUCTION.md for the settings it needs.

# 1. build the website (React) into client/dist
FROM node:22-alpine AS web
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# 2. the API, which also serves the built website
FROM node:22-alpine
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN npm --prefix server ci --omit=dev && npm cache clean --force
COPY server/ server/
COPY --from=web /app/client/dist client/dist
# uploaded outlines (and the data file, when DATABASE_URL isn't set) are written here: mount a volume on it
RUN mkdir -p server/data && chown -R node:node server/data
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:4000/api/site >/dev/null || exit 1
CMD ["node", "server/src/index.js"]
