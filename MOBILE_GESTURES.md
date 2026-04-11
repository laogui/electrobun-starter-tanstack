# Mobile Gesture Support

This document describes the mobile and touch gesture adaptations made to the canvas application.

## Overview

The canvas application was originally designed for desktop interactions (mouse, trackpad, keyboard). This implementation adds comprehensive touch gesture support for mobile and tablet devices.

## Changes Made

### 1. Touch Gesture Utilities (`src/mainview/hooks/useTouchGesture.ts`)

Created a reusable hook library for common touch gestures:

- **`useTouchDrag`**: Handles touch-based panning/scrolling with pointer events
  - Supports both mouse and touch input
  - Implements drag threshold to distinguish clicks from drags
  - Provides velocity multiplier for enhanced drag feel
  - Manages cursor feedback and prevents text selection

- **`useLongPress`**: Handles long-press gestures (e.g., for context menus)
  - Configurable duration (default 500ms)
  - Cancels on movement beyond threshold
  - Works with both mouse and touch

- **`isTouchDevice`**: Utility to detect touch capability

### 2. FolderView Touch Support

Updated `src/mainview/components/canvas/FolderView.tsx`:

- Replaced mouse events (`mouseDown`, `mouseMove`, `mouseUp`) with unified pointer events
- Now supports touch-based horizontal scrolling
- Maintains all existing functionality while adding touch compatibility

**Before:**
```tsx
onMouseDown={handleMouseDown}
onMouseMove={handleMouseMove}
onMouseUp={handleMouseUp}
```

**After:**
```tsx
onPointerDown={handlePointerDown}
onPointerMove={handlePointerMove}
onPointerUp={handlePointerUp}
onPointerCancel={handlePointerUp}
```

### 3. CreateMenu Touch Support

Updated `src/mainview/components/canvas/CreateMenu.tsx`:

- Changed from `mousedown` to `pointerdown` for dismissal handling
- Now responds to both mouse clicks and touch taps

### 4. Context Menu Long-Press Support

Enhanced `src/mainview/hooks/useContextMenu.ts`:

- Added long-press gesture detection for touch devices
- Provides `onPaneLongPressStart` for canvas long-press
- Provides `onNodeLongPressStart` for node long-press
- Automatically detects touch devices and only activates for touch input
- Cancels on movement to prevent accidental triggers

### 5. React Flow Configuration

Updated `src/mainview/routes/index.tsx`:

- Added `panOnScrollMode="vertical"` for better scroll behavior
- Added `zoomOnDoubleClick={false}` to prevent accidental zoom on mobile
- Added `panOnDrag={true}` for explicit touch panning
- Wired up long-press handlers to the canvas container

**New React Flow Props:**
```tsx
panOnScrollMode="vertical"  // Vertical scroll for panning
zoomOnDoubleClick={false}   // Disable double-tap zoom
panOnDrag={true}            // Enable touch panning
```

### 6. Mobile CSS Optimizations

Created `src/mainview/styles/mobile-gestures.css`:

- Disables text selection during drag operations
- Improves touch-action properties for better gesture handling
- Increases touch target sizes on touch devices
- Prevents double-tap zoom in mobile browsers
- Optimizes scrollbar behavior for touch devices
- Adds smooth scrolling for folder view

**Key CSS Features:**
- Touch-action management for precise gesture control
- Larger hit areas for resize handles and connection points on touch devices
- Prevention of unwanted browser gestures (double-tap zoom, text selection)
- Media queries to apply touch-specific styles only on touch devices

## Touch Gesture Support Summary

### Supported Gestures

| Gesture | Desktop | Mobile | Implementation |
|---------|---------|--------|----------------|
| Pan Canvas | Mouse drag | Touch drag | React Flow built-in |
| Zoom | Scroll wheel | Pinch | React Flow `zoomOnPinch` |
| Node Drag | Mouse drag | Touch drag | React Flow built-in |
| Node Resize | Drag handle | Touch drag handle | React Flow `NodeResizeControl` |
| Context Menu | Right-click | Long-press (500ms) | `useContextMenu` hook |
| Folder Scroll | Mouse drag | Touch drag | `useTouchDrag` hook |
| Menu Dismiss | Click outside | Tap outside | Pointer events |
| Double-Click | Mouse | Touch (disabled) | `zoomOnDoubleClick={false}` |

### Browser Compatibility

The implementation uses modern web APIs:

- **Pointer Events API**: Unified handling of mouse, touch, and pen input
- **Touch-action CSS**: Precise control over touch behaviors
- Media queries for touch device detection

Supported browsers:
- Chrome/Edge 55+
- Firefox 59+
- Safari 13+
- All modern mobile browsers

## Testing Recommendations

To test mobile gestures:

1. **Chrome DevTools**: Enable device toolbar (Cmd+Shift+M) and select a mobile device
2. **Real Device**: Test on actual mobile/tablet devices
3. **Touch Screen Laptop**: If available, use Windows touch screen devices

### Test Cases

- [ ] Canvas panning with touch drag
- [ ] Pinch zoom on canvas
- [ ] Node drag and drop with touch
- [ ] Node resize with touch on handles
- [ ] Horizontal scroll in folder view with touch
- [ ] Long-press on canvas shows context menu
- [ ] Long-press on node shows node context menu
- [ ] Tap outside menu to dismiss
- [ ] Create button tap to open/close menu
- [ ] No accidental double-tap zoom
- [ ] No text selection during drag operations

## Future Enhancements

Potential improvements for mobile experience:

1. **Multi-touch Selection**: Support two-finger tap to multi-select nodes
2. **Gesture Feedback**: Add haptic feedback on long-press (if supported)
3. **Mobile-Optimized UI**: Larger buttons and touch targets throughout
4. **Swipe Gestures**: Swipe to delete, swipe to navigate
5. **Touch Keyboard Integration**: Better handling when virtual keyboard appears
6. **Orientation Support**: Optimize layout for portrait/landscape modes

## Architecture Notes

### Design Principles

1. **Unified Input Handling**: Use Pointer Events API for consistent mouse/touch handling
2. **Progressive Enhancement**: Desktop functionality remains unchanged
3. **Minimal Changes**: Leverage existing React Flow touch support where possible
4. **Reusable Hooks**: Extract common gesture patterns into hooks
5. **Performance**: Use CSS touch-action to prevent default browser behaviors efficiently

### Key Files Modified

- `src/mainview/hooks/useTouchGesture.ts` (new)
- `src/mainview/hooks/useContextMenu.ts` (enhanced)
- `src/mainview/components/canvas/FolderView.tsx` (pointer events)
- `src/mainview/components/canvas/CreateMenu.tsx` (pointer events)
- `src/mainview/routes/index.tsx` (React Flow config + long-press)
- `src/mainview/styles/mobile-gestures.css` (new)
- `src/mainview/main.tsx` (CSS import)

## References

- [Pointer Events API](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)
- [Touch-action CSS](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action)
- [React Flow Touch Handling](https://reactflow.dev/learn/advanced-use/touch-devices)
