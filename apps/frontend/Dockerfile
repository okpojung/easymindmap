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
ENV VITE_API_URL=$VITE_API_URL \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN cd apps/frontend && npm run build

FROM nginx:alpine
COPY --from=build /repo/apps/frontend/dist /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
