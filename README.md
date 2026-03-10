# task-furnace

An always-on orchestration engine that continuously picks up software development tasks, assigns them to AI agents one by one, executes in a loop, and tracks progress.

## Overview

Task Furnace is designed to automate and orchestrate AI-driven software development workflows. It operates as a persistent background service that manages task queues, assigns work to specialized AI agents, and ensures continuous progress tracking.

## Prerequisites

- [Bun](https://bun.sh) v1.3.9 or later

## Setup

```bash
# Install dependencies
bun install
```

## Development Commands

```bash
# Run in development mode (hot reload)
bun run dev

# Build for production
bun run build

# Run production build
bun run start

# Type check
bun run typecheck

# Lint
bun run lint
bun run lint:fix

# Format code
bun run format
bun run format:check

# Run tests
bun run test
bun run test:watch
```

## Project Structure

```
task-furnace/
├── src/           # Source code
├── docs/          # Design documentation
├── dist/          # Build output (generated)
├── package.json   # Project configuration
├── tsconfig.json  # TypeScript configuration
└── README.md      # This file
```

## License

MIT
