# Blink

**Heo Jeong-O · 박석준 | Department of Information Systems**

### Description (One Sentence)

An AI-powered desktop note-taking app that helps users refine their writing, visualize ideas, and reuse existing notes without interrupting their workflow.

### 1. Key Features

**01. Basic Note Management (CRUD)**

- Create, read, update, and delete Markdown notes.
- Manage notes and folders in a simple desktop editor.

[스크린샷: Blink 메인 화면 및 노트 에디터]

**02. AI Writing Assistance**

- **Organize:** Restructure rough notes into clear, organized writing.
- **Expand:** Enrich selected text with web-grounded explanations and sources.

[스크린샷: AI 편집 전후 비교]

**03. AI Visualization**

- Transform selected text into diagrams and infographics.
- Edit layouts and export visualizations as PNG.

[스크린샷: Visualize 실행 결과]

**04. Note Search & Reuse**

- Search notes by title and content.
- Open, link, or import existing notes into the current document.
- Maintain bidirectional links between related notes.

[스크린샷: 검색 및 Link/Import 인터페이스]

**05. AI Folder Organization**

- Automatically classify notes into relevant folders using AI.
- Preview and confirm the suggested folder structure.

[스크린샷: AI 폴더 정리 결과]

### 2. Tools & Architecture

[아키텍처 다이어그램 삽입]

**Development Tools**

- Claude Code (Claude Opus 5.5)
- TypeScript 6.0
- Electron 44.4 / React 19.3 / Tiptap 3.31
- SQLite 3.53 / Drizzle ORM 0.45
- Node.js 24 / pnpm 11
- electron-vite / Vitest / Playwright / electron-builder
- OpenAI SDK (OpenAI & Kimi)

### 3. Platform

- Desktop Application (Electron)
- [실제 테스트한 운영체제 및 버전 기재]
