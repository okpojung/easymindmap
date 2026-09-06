# EasyMindMap frontend — Coolify(Dockerfile 빌드팩)용.
#
# 빌드 컨텍스트는 저장소 루트여야 한다: vite.config.ts의 '@emm' 별칭과
# tsconfig paths가 ../../packages/emm-parser/src 를 참조하므로
# packages/ 를 함께 COPY 해야 빌드된다 (Nixpacks + Base Directory
# apps/frontend 로는 컨텍스트 밖이라 TS2307 실패 — dev-server-coolify.md §5.3).
#   Coolify 설정: Build Pack=Dockerfile, Base Directory=/,
#                 Dockerfile Location=apps/frontend/Dockerfile
FROM node:22-alpine AS build
WORKDIR /repo

COPY packages/ ./packages/
COPY apps/frontend/package.json apps/frontend/package-lock.json ./apps/frontend/
RUN cd apps/frontend && npm ci

COPY apps/frontend/ ./apps/frontend/
ARG VITE_API_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SUPABASE_AUTH_PREFIX
ENV VITE_API_URL=$VITE_API_URL \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_SUPABASE_AUTH_PREFIX=$VITE_SUPABASE_AUTH_PREFIX
RUN cd apps/frontend && npm run build

FROM nginx:alpine
COPY --from=build /repo/apps/frontend/dist /usr/share/nginx/html

# ★ **템플릿으로 넣는다** (2026-09-06). nginx.conf 에 `${API_ORIGIN}` 이
#   들어 있어서, 공식 이미지가 기동할 때 envsubst 로 채워야 한다.
#   `conf.d/` 에 그대로 넣으면 그 글자가 남아 nginx 가 뜨지 않는다.
COPY apps/frontend/nginx.conf /etc/nginx/templates/default.conf.template

# **바꿀 변수를 한정한다** — 안 그러면 envsubst 가 `$uri`·`$host` 같은
# nginx 자기 변수까지 (환경에 같은 이름이 있으면) 지워 버린다.
ENV NGINX_ENVSUBST_FILTER="API_ORIGIN"

# ★ **기본값은 아무 데도 안 가는 주소다.** 배포가 API_ORIGIN 을 안 주면
#   퍼블리싱 링크의 `<head>` 조각만 못 받고(카드가 예전처럼 안 뜬다),
#   **사이트는 그대로 뜬다.** 비워 두면 `proxy_pass ;` 가 되어 nginx 가
#   아예 기동하지 못한다 — 그쪽이 훨씬 나쁘다.
ENV API_ORIGIN="http://127.0.0.1:9"
EXPOSE 80
