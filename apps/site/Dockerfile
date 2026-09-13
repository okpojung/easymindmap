# EasyMindMap 홈페이지 — Coolify(Dockerfile 빌드팩)용.
#
#   Coolify 설정: Build Pack=Dockerfile, Base Directory=/,
#                 Dockerfile Location=apps/site/Dockerfile
#
# 빌드 컨텍스트를 저장소 루트로 두는 것은 프런트엔드와 맞추기 위해서다
# (이 앱만 놓고 보면 apps/site 만 있어도 된다).
FROM node:22-alpine AS build
WORKDIR /repo

COPY apps/site/package.json apps/site/package-lock.json ./apps/site/
RUN cd apps/site && npm ci

COPY apps/site/ ./apps/site/
# 빌드 시점에 박히는 주소들 — 정적 파일에는 런타임 설정이 없다
ARG VITE_API_URL
ARG VITE_APP_URL
ENV VITE_API_URL=$VITE_API_URL \
    VITE_APP_URL=$VITE_APP_URL
RUN cd apps/site && npm run build

# nginx 는 **버전을 고정**한다 — 프런트엔드와 같은 이유(재배포마다 조용히
# 바뀌면 같은 커밋이 다른 이미지가 된다).
FROM nginx:1.28-alpine
COPY --from=build /repo/apps/site/dist /usr/share/nginx/html

# ★ **템플릿으로 넣는다** — `${APP_ORIGIN}` 이 들어 있다.
COPY apps/site/nginx.conf /etc/nginx/templates/default.conf.template
ENV NGINX_ENVSUBST_FILTER="APP_ORIGIN"

# ★ 기본값은 **지금 도는 개발 앱**이다. 프런트엔드의 `API_ORIGIN` 과 달리
#   "아무 데도 안 가는 주소" 로 두지 않는다 — 그러면 배포가 값을 빠뜨렸을 때
#   `/p/` 가 통째로 죽고, 그게 이 사이트의 주된 길이기 때문이다.
ENV APP_ORIGIN="https://pro-dev.mindmap.ai.kr"
EXPOSE 80
