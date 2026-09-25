FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
ENV PORT=8787 \
    DB_PATH=/data/licenses.db \
    LICENSE_PRIVATE_KEY_FILE=/data/private.pem \
    TRUST_PROXY=true
VOLUME /data
EXPOSE 8787
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
