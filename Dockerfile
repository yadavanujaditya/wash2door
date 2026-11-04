FROM node:22-slim
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
COPY admin ./admin
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/washwala.db TRUST_PROXY=1
VOLUME /data
EXPOSE 3000
CMD ["node", "--no-warnings", "server/index.js"]
