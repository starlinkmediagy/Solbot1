FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

# Fly will mount a volume here for the SQLite DB
RUN mkdir -p /data

ENV NODE_ENV=production
CMD ["node", "--experimental-sqlite", "src/index.js"]
