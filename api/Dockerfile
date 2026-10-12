FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV DATA_DIR=/data
ENV NODE_OPTIONS=--experimental-sqlite
EXPOSE 8080
CMD ["node", "src/index.js"]
