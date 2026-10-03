# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . .
RUN npm run build
ARG APP_REVISION
RUN test -n "$APP_REVISION" && printf '{"revision":"%s"}\n' "$APP_REVISION" > dist/version.json

FROM nginx:1.29-alpine AS runtime
ARG APP_REVISION
LABEL org.opencontainers.image.source="https://github.com/zhanpoint/jsonsage" \
      org.opencontainers.image.revision="$APP_REVISION"
COPY deploy/nginx.container.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
