# 📘 GitHub 완전초보자용 실습 매뉴얼

## 1. Git / GitHub 개념

-   Git: 파일 변경 이력을 관리하는 프로그램
-   GitHub: Git 저장소를 인터넷에 저장하는 서비스

### 기본 흐름

로컬 작업 → add → commit → push → GitHub

------------------------------------------------------------------------

## 2. 최초 프로젝트 업로드

``` bash
git init
git branch -M main
git add .
git commit -m "init: initial commit"
git remote add origin https://github.com/계정명/저장소명.git
git push -u origin main
```

------------------------------------------------------------------------

## 3. 새 파일 추가

``` bash
git status
git add 파일명
git commit -m "docs: add file"
git push
```

------------------------------------------------------------------------

## 4. 기존 파일 수정

``` bash
git status
git add 파일명
git commit -m "docs: update file"
git push
```

------------------------------------------------------------------------

## 5. push 실패 시 해결

``` bash
git pull --rebase origin main
git push
```

------------------------------------------------------------------------

## 6. 새 PC에서 시작

1.  GitHub Desktop 설치
2.  Repository Clone
3.  수정 → commit → push

------------------------------------------------------------------------

## 7. 필수 명령어 정리

  명령어       설명
  ------------ ----------------
  git status   현재 상태 확인
  git add      파일 추가
  git commit   변경 저장
  git pull     최신 가져오기
  git push     GitHub 반영

------------------------------------------------------------------------

## 8. 핵심 요약

-   add → commit → push 기억
-   status 자주 확인
-   push 안되면 pull 먼저

------------------------------------------------------------------------

## 🚀 한줄 정리

Git은 기록, GitHub는 공유
