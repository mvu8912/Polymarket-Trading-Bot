FROM node:20-alpine

WORKDIR /app

COPY package.json tsconfig.json vitest.config.ts .
COPY src ./src
COPY config.yaml ./config.yaml
COPY README.md ./README.md
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN npm install
RUN npm run build
RUN chmod +x ./docker-entrypoint.sh

ENV NODE_ENV=production

CMD ["./docker-entrypoint.sh"]
