# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Development server**: `npm run dev` or `pnpm dev` - Starts the Next.js development server on http://localhost:3000
- **Build**: `npm run build` or `pnpm build` - Creates optimized production build
- **Start production**: `npm run start` or `pnpm start` - Runs the production build
- **Lint**: `npm run lint` or `pnpm lint` - Runs ESLint (note: currently configured to ignore errors during builds)

## Architecture Overview

This is a **Next.js 15 time tracking application** with the following key architectural components:

### Core Application Structure
- **Main page**: `app/page.tsx` - Contains the primary TimeTracker component with complex state management
- **Layout**: `app/layout.tsx` - Root layout with Geist fonts and global styles
- **UI Components**: `components/ui/` - Shadcn/UI component library with Radix UI primitives
- **Custom Components**: `components/` - Application-specific components

### Time Tracking System Architecture

**Time Block Management**:
- The application divides the day into configurable time blocks (1-30 minutes each)
- Blocks are generated dynamically based on `blockDurationMinutes` setting
- Each block has states: active, completed, current, past, future
- Current block is calculated in real-time based on system time

**Task Management Features**:
- **Drag & Drop Planning**: Tasks can be moved between time blocks with two modes:
  - Simple Move: Move task to another block (existing tasks get postponed)
  - Expand Mode: Fill multiple consecutive blocks with numbered tasks
- **Auto-scheduling**: Future tasks automatically get pushed forward when changes are made
- **Visual Feedback**: Recently moved blocks show animation and visual indicators

**Progress Tracking**:
- **Progress Check Popup**: Appears when time blocks are completed with timer running
- **Auto-completion**: Blocks automatically complete when time transitions (with real tasks only)
- **Timeout Handling**: 15-second timeout for responses, marks blocks as "Interrupted" if no response

### Integration Systems

**Voice Interface** (`components/voice-interface.tsx`):
- Mock voice recognition and synthesis
- Natural language task creation
- Conversation history with TTS support

**Notion Integration** (`components/notion-tasks.tsx`, `app/api/notion/route.ts`):
- Mock Notion API integration for task import
- Database filtering and search capabilities
- Task selection and mapping to time blocks

**Calendar Integration**:
- Mock calendar events that automatically populate time blocks
- Color-coded task types (calendar, notion, custom)

### State Management Patterns

The main TimeTracker component uses complex useState patterns for:
- **Time Block State**: Array of TimeBlock objects with tasks, status, and timing
- **Drag State**: Tracks drag operations and planning mode selections
- **Timer State**: Current timer, active blocks, and completion tracking
- **UI State**: Modals, popups, notifications, and user interactions

### Key Design Patterns

1. **Real-time Updates**: useEffect hooks manage time-based state changes
2. **Auto-start Logic**: Timer automatically starts for blocks with real tasks
3. **Task Postponement**: Sophisticated algorithms for rescheduling when conflicts arise
4. **Visual State Indicators**: CSS classes and animations provide rich user feedback
5. **Modal Management**: Multiple overlay components for different workflows

## Technology Stack

- **Framework**: Next.js 15 with App Router
- **Styling**: Tailwind CSS with custom animations and gradients
- **UI Library**: Radix UI primitives via Shadcn/UI components
- **TypeScript**: Fully typed with strict configuration
- **Package Manager**: pnpm (based on pnpm-lock.yaml)

## Development Notes

- **Hot Reload**: Development server supports fast refresh for React components
- **Build Configuration**: ESLint and TypeScript errors are ignored during builds (see next.config.mjs)
- **Image Optimization**: Disabled for unoptimized images
- **Font Loading**: Geist Sans and Mono fonts are optimized and preloaded

## Component Architecture

**Core Components**:
- `TimeTracker` (app/page.tsx): Main application logic and state management
- `ProgressCheckPopup`: Modal for block completion feedback with countdown timer
- `QuickTaskInput`: Inline task editing with auto-save functionality
- `TaskSelector`: Modal for selecting from predefined task templates
- `VoiceInterface`: Voice-controlled task creation and management
- `NotionTasks`: Integration component for importing Notion database tasks

**UI Foundation**: 
- Uses Shadcn/UI design system with consistent spacing, colors, and interactions
- Custom Tailwind configuration with extended color palette and animations
- Responsive grid layouts that adapt to different block duration settings

## Key Features to Understand

1. **Block Duration Flexibility**: The entire grid recalculates when block duration changes
2. **Smart Scheduling**: Tasks automatically reschedule to avoid conflicts
3. **Progress Tracking**: Real-time completion tracking with voice alerts and visual feedback
4. **Multi-modal Input**: Support for voice, manual input, and Notion integration
5. **Drag-and-Drop Planning**: Advanced drag operations with visual feedback and multi-block selection