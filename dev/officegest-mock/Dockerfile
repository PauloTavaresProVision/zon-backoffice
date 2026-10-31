FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.mjs ./
RUN mkdir -p /data && chown node:node /data
USER node
ENV STATE_FILE=/data/state.json PORT=4630
EXPOSE 4630
CMD ["node", "server.mjs"]
