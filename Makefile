SHELL := /bin/bash
NPM ?= npm
STICKER_DIR := packages/dsh-sticker
OTP ?=

.PHONY: help dev build lint stickers-build stickers-api stickers-mcp stickers-verify stickers-pack publish publish-dry-run

help:
	@echo "Lynn sticker repository targets:"
	@echo "  make dev             Start the Next.js gallery"
	@echo "  make build           Build the Next.js gallery"
	@echo "  make lint            Lint the Next.js app"
	@echo "  make stickers-build  Regenerate catalog, WebP stills and WebM loops"
	@echo "  make stickers-api    Start the REST API + MCP HTTP server (:4319)"
	@echo "  make stickers-mcp    Start the MCP stdio server"
	@echo "  make stickers-verify Run the end-to-end sticker stack verification"
	@echo "  make stickers-pack   Build dist/dsh-lynn-sticker-<version>.tgz"
	@echo "  make publish         Publish dsh-lynn-sticker to npmjs (2FA prompt)"
	@echo "                       Non-interactive: make publish OTP=123456"
	@echo "  make publish-dry-run Show what would be published without publishing"

dev:
	$(NPM) run dev

build:
	$(NPM) run build

lint:
	$(NPM) run lint

stickers-build:
	$(NPM) run stickers:build

stickers-api:
	$(NPM) run stickers:api

stickers-mcp:
	$(NPM) run stickers:mcp

stickers-verify:
	$(NPM) run stickers:verify

stickers-pack:
	$(NPM) run stickers:pack

# Publishes the self-contained DSH bundle to the npm registry.
# npm prompts for the 2FA one-time password; pass OTP=<code> for a single
# non-interactive run when the code is fresh.
publish:
	cd $(STICKER_DIR) && $(NPM) publish --access public $(if $(OTP),--otp=$(OTP),)

publish-dry-run:
	cd $(STICKER_DIR) && $(NPM) publish --dry-run --access public
