FROM node:22-alpine
WORKDIR /app
COPY api/package.json ./
COPY api/src ./src
ENV DATA_DIR=/data
ENV WEB_DIR=/srv/web
ENV NODE_OPTIONS=--experimental-sqlite
EXPOSE 8080
CMD ["node", "src/index.js"]
