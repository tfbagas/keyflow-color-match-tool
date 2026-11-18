FROM node:20-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY server.js ./

ENV PORT=8080
ENV NODE_OPTIONS="--max-old-space-size=96"
EXPOSE 8080

CMD ["node", "server.js"]
