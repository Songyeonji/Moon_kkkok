# Vercel 자동 배포 설정

`.github/workflows/vercel-deploy.yml`은 다음 배포를 자동 실행합니다.

- Pull Request 생성 또는 갱신: Preview 배포
- `main` 브랜치 push: Production 배포

## 최초 1회 설정

1. Vercel에서 이 저장소를 새 프로젝트로 연결합니다.
2. Vercel 프로젝트의 Preview와 Production 환경에 아래 값을 등록합니다.
   - `VITE_MOCK=0`
   - `VITE_API_URL=<Google Apps Script /exec URL>`
3. Vercel Account Settings에서 Access Token을 생성합니다.
4. 로컬 프로젝트에서 `npx vercel link`를 실행합니다.
5. 생성된 `.vercel/project.json`의 `orgId`, `projectId`를 확인합니다.
6. GitHub 저장소의 **Settings > Secrets and variables > Actions**에 다음 Repository Secret을 추가합니다.
   - `VERCEL_TOKEN`: 3단계에서 생성한 토큰
   - `VERCEL_ORG_ID`: `.vercel/project.json`의 `orgId`
   - `VERCEL_PROJECT_ID`: `.vercel/project.json`의 `projectId`

`.vercel`에는 프로젝트 연결 정보와 내려받은 환경변수가 저장될 수 있으므로 커밋하지 않습니다.

## 동작 확인

PR을 열면 Actions의 **Vercel Deploy / Preview** 작업에서 Preview URL을 확인할 수 있습니다. PR을 `main`에 병합하면 **Vercel Deploy / Production** 작업이 프로덕션 도메인에 배포합니다.

외부 포크에서 생성된 PR에는 저장소 시크릿이 제공되지 않으므로 Preview 배포를 안전하게 건너뜁니다.

Vercel의 Git 연동 자동 배포도 켜져 있으면 한 커밋이 중복 배포될 수 있습니다. 이 GitHub Actions 워크플로를 사용할 때는 Vercel 프로젝트의 Git 자동 배포를 끄거나, 프로젝트를 CLI 전용으로 연결하세요.
