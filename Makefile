.PHONY: help install dev build test lint format typecheck install-hooks icons bump clean

help:
	@echo "  make install        Install all workspace dependencies"
	@echo "  make dev            Start Tauri dev (Vite + native window)"
	@echo "  make build          Build all packages"
	@echo "  make test           Run all tests"
	@echo "  make lint           Run ESLint, Prettier, Stylelint"
	@echo "  make format         Auto-fix formatting + lint"
	@echo "  make typecheck      Typecheck all packages"
	@echo "  make install-hooks  Install pre-commit hooks"
	@echo "  make icons          Regenerate OS app icons from packages/web/public/icon.svg"
	@echo "  make bump V=1.2.3   Bump version (or V=patch|minor|major)"
	@echo "  make clean          Remove build output"

install:       ; pnpm install
dev:           ; pnpm dev
build:         ; pnpm build
test:          ; pnpm test
lint:          ; pnpm lint
format:        ; pnpm format
typecheck:     ; pnpm typecheck
install-hooks: ; pnpm exec lefthook install
icons:         ; pnpm -F @daedalus/desktop icons
bump:
	@if [ -z "$(V)" ]; then echo "usage: make bump V=<version|patch|minor|major>"; exit 1; fi
	@node scripts/bump-version.mjs $(V)
clean:         ; pnpm -r exec rm -rf dist coverage .vite
