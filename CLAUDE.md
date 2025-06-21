# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MangaMaker is a React Router 7 web application that converts meeting minutes (text or audio) into 4-panel manga comics using Google AI services. The application features:

- Text-to-speech processing using Google Cloud Speech API
- AI-powered comic generation using Google GenAI (Gemini 2.0 and Imagen 4.0)
- OCR text detection and translation pipeline
- Firebase authentication and cloud storage
- Real-time Server-Sent Events (SSE) for processing status updates

## Development Commands

### Core Development
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm start           # Start production server
npm run typecheck   # Run TypeScript type checking
```

### Code Quality
```bash
npm run lint        # Lint and auto-fix with Biome
npm run format      # Format code with Biome
npm run check       # Run Biome check with auto-fix
```

Always run `npm run typecheck` and `npm run lint` after making significant changes to ensure type safety.

## Architecture Overview

### Core Processing Flow
The main application flow processes user input through a multi-stage AI pipeline:

1. **Input Processing** (`app/routes/_index.tsx`): Handles text input or audio file uploads
2. **Streaming Pipeline** (`app/routes/stream.tsx`): Server-Sent Events endpoint that orchestrates:
   - Speech-to-text conversion (Google Cloud Speech)
   - Content summarization (Gemini 2.0)
   - Comic image generation (Imagen 4.0) 
   - OCR text detection and translation
   - Image processing with text masking and overlay

### Key Services Architecture

- **Vision Service** (`app/services/vision.server.ts`): Google Cloud Vision API integration for OCR
- **Image Processing** (`app/services/image-processing.server.ts`): Canvas-based text masking and overlay
- **Translation Service** (`app/services/translation.server.ts`): Text translation capabilities
- **Firebase Integration** (`app/lib/firebase-admin.ts`): Authentication and cloud storage

### Authentication & Session Management
Uses Firebase Authentication with server-side session cookies:
- `app/lib/session.server.ts`: Session management utilities
- `app/lib/session-utils.server.ts`: User verification helpers
- `app/lib/auth.server.ts`: Authentication configuration

### Type System for Real-time Communication
Shared enums in `app/types/streaming.ts` ensure type safety across client/server:
- `ProcessingStatus`: Standardized progress messages
- `ErrorMessage`: Consistent error handling
- `EventType`: SSE event type definitions
- `LoadingStatus`: Union type for UI state management

### UI Components Structure
- **Main Interface** (`app/routes/_index.tsx`): Handles dual input modes (text/audio) with tabbed interface
- **File Upload** (`app/components/FileUploader.tsx`): Uppy.js integration for audio file handling
- **Image Gallery** (`app/routes/gallery.tsx`): User's saved comics with Firebase storage integration

## Firebase Configuration

The application uses Firebase for:
- Authentication (session cookies)
- Cloud Storage (comic image storage)
- Admin SDK for server-side operations

Storage bucket: `fridaycat20.firebasestorage.app`

## Google Cloud Services Integration

### Required APIs
- Google Cloud Speech API (audio transcription)
- Google Cloud Vision API (OCR)
- Google GenAI (Vertex AI location: us-central1, project: fridaycat20)

### Service Configuration
Services are initialized with application default credentials. Ensure proper GCP authentication is configured in the deployment environment.

## Development Notes

### Streaming Implementation
The SSE implementation in `stream.tsx` uses ReadableStream with proper error handling and client-side reconnection logic. Status updates use shared enums for consistency.

### Canvas Image Processing
Text masking and overlay operations use server-side Canvas API for precise image manipulation, handling font rendering and positioning calculations.

### State Management
Frontend uses React hooks with careful state synchronization between streaming status, UI components, and user interactions. No external state management library is used.