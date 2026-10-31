FROM node:24-alpine
WORKDIR /app
COPY package.json server.mjs ./
RUN mkdir -p /data && chown node:node /data
USER node
ENV STATE_FILE=/data/state.json PORT=4640
EXPOSE 4640
CMD ["node", "server.mjs"]
