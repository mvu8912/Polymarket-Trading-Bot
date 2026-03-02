FROM ubuntu:latest

RUN apt-get update

RUN apt-get install -y python3 python3-pip curl build-essential git npm

RUN curl -L https://nodejs.org/dist/v24.13.1/node-v24.13.1-linux-x64.tar.xz | tar -xJ -C /usr/local --strip-components=1

RUN curl -L https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb > /tmp/chrome.deb && apt install -y /tmp/chrome.deb && rm /tmp/chrome.deb

RUN npm install -g typescript

RUN if getent passwd 1000; then \
        OLD_USER=$(getent passwd 1000 | cut -d: -f1); \
        OLD_GROUP=$(getent group 1000 | cut -d: -f1); \
        usermod -l mv "$OLD_USER"; \
        groupmod -n mv "$OLD_GROUP"; \
        usermod -d /app -m mv; \
    else \
        groupadd -g 1000 mv && \
        useradd -u 1000 -g mv -m -s /bin/bash mv; \
    fi

WORKDIR /app

COPY package.json tsconfig.json vitest.config.ts .
COPY src ./src
COPY config.yaml ./config.yaml
COPY README.md ./README.md
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN npm install
RUN npm run build
RUN chmod +x ./docker-entrypoint.sh

RUN chown -R mv:mv /app

USER mv

ENV NODE_ENV=production

CMD ["./docker-entrypoint.sh"]
