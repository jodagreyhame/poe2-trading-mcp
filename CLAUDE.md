# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **Claude Code PM (CCPM)** - a spec-driven development workflow system for Claude Code that transforms PRDs into shipping code through GitHub issues, Git worktrees, and parallel AI agents.

**Core Philosophy**: No vibe coding. Every line of code must trace back to a specification through a 5-phase discipline: Brainstorm → Document → Plan → Execute → Track.

## System Architecture

```
.claude/
├── CLAUDE.md          # Core system instructions (copy to project root)
├── agents/            # Specialized task agents for context preservation
├── commands/          # Command definitions organized by category
│   ├── context/       # Context management commands
│   ├── pm/            # Project management workflow commands
│   └── testing/       # Test configuration and execution
├── context/           # Project-wide context documentation
├── epics/             # PM workspace (add to .gitignore)
│   └── [epic-name]/   # Epic implementation plans and task files
├── prds/              # Product Requirements Documents
├── rules/             # Development rules and conventions
└── scripts/           # Utility scripts (especially pm/ directory)
```

## Essential Commands

### Project Management Workflow
- `/pm:init` - Initialize PM system (installs gh CLI, gh-sub-issue extension)
- `/pm:prd-new <name>` - Create new PRD through guided brainstorming
- `/pm:prd-parse <name>` - Transform PRD into technical epic
- `/pm:epic-oneshot <name>` - Decompose epic and sync to GitHub
- `/pm:issue-start <id>` - Launch specialized agent for issue
- `/pm:next` - Get next priority task with context
- `/pm:status` - Project dashboard

### Context Management
- `/context:create` - Create initial project context documentation
- `/context:prime` - Load context into current conversation
- `/testing:prime` - Configure testing framework

### Development Commands
- `bash .claude/scripts/pm/init.sh` - System initialization script
- Testing: Use `/testing:run` with test-runner agent
- No specific build/lint commands (this is a Claude Code system, not a traditional codebase)

## Key Patterns & Architecture

### Spec-Driven Development Flow
1. **PRD Creation** → `.claude/prds/feature.md`
2. **Epic Planning** → `.claude/epics/feature/epic.md`  
3. **Task Decomposition** → `.claude/epics/feature/001.md, 002.md...`
4. **GitHub Sync** → Issues created with parent-child relationships
5. **Parallel Execution** → Multiple agents work simultaneously

### Agent System for Context Optimization
- **file-analyzer**: Summarizes verbose files (logs, configs) with 80-90% size reduction
- **code-analyzer**: Hunts bugs across multiple files without polluting main context
- **test-runner**: Executes tests and returns only essential results
- **parallel-worker**: Coordinates multiple work streams in Git worktrees

### GitHub Integration Strategy
- Uses `gh-sub-issue` extension for proper parent-child issue relationships
- Falls back to task lists if extension unavailable
- Epic issues automatically track sub-task completion
- Local files sync to GitHub issues: `001.md` → `1234.md` after sync

### Parallel Execution Model
Issues are not atomic. A single "Implement authentication" issue becomes:
- **Agent 1**: Database schemas and migrations
- **Agent 2**: Service layer and business logic  
- **Agent 3**: API endpoints and middleware
- **Agent 4**: UI components and forms
- **Agent 5**: Tests and documentation

All running simultaneously in the same Git worktree.

## Important Rules from .claude/CLAUDE.md

### Sub-Agent Usage (CRITICAL)
- **ALWAYS use file-analyzer** when asked to read files
- **ALWAYS use code-analyzer** for code search, bug analysis, logic tracing
- **ALWAYS use test-runner** to execute tests and analyze results
- These agents provide 80-90% context reduction while preserving critical information

### Development Standards
- **NO PARTIAL IMPLEMENTATION** - Complete everything fully
- **NO CODE DUPLICATION** - Reuse existing functions and constants
- **NO DEAD CODE** - Use it or delete it completely
- **IMPLEMENT TESTS** for every function with verbose, debugging-ready tests
- **NO OVER-ENGINEERING** - Simple functions over enterprise patterns
- **FAIL FAST** for critical config, graceful degradation for optional features

### Error Handling Philosophy
- Fail fast for critical configuration (missing dependencies)
- Log and continue for optional features
- Graceful degradation when external services unavailable
- User-friendly messages through resilience layer

## File Structure Notes

### Required Files
- `README.md` - Comprehensive system documentation
- `AGENTS.md` - Agent system documentation and philosophy  
- `COMMANDS.md` - Complete command reference
- `.claude/scripts/pm/init.sh` - System initialization script

### GitHub Integration Files
System expects:
- GitHub CLI (`gh`) installed and authenticated
- `gh-sub-issue` extension for parent-child issue relationships
- Git repository with remote origin configured

## Context Optimization Strategy

Main conversation thread stays clean and strategic by:
1. **Agents handle heavy lifting** (file reading, test execution, implementation)
2. **Context isolation** - Implementation details stay in agents
3. **Concise returns** - Only essential information returns to main thread
4. **Parallel execution** - Multiple agents work without context collision

This creates a hierarchy that maximizes parallelism while preserving context at every level.

## Workflow Integration

The system integrates with existing GitHub workflows:
- Issues provide transparent audit trail
- Comments track AI progress in real-time
- PRs happen naturally through standard GitHub flow
- Team members can join anywhere - context is always visible
- No separate project management tools needed