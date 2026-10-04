# 빌드 컨텍스트는 저장소 루트(@sprout/schema를 같이 쓴다). server/docker-compose.yaml 참고
FROM node:22-alpine
WORKDIR /app
COPY packages/schema/src /app/packages/schema/src
COPY server/api/package.json /app/server/api/package.json
RUN cd /app/server/api && npm install --omit=dev --no-audit --no-fund
COPY server/api/src /app/server/api/src
WORKDIR /app/server/api
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 6060
CMD ["node", "--experimental-strip-types", "--no-warnings", "src/server.ts"]
