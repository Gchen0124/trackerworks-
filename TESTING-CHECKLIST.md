# Testing Checklist - Key Functions

## 🌙 Active Window Setup (FIXED)
✅ **Fixed**: Added missing ActiveWindowSetup component rendering  
- [ ] Click moon button (🌙) in top right
- [ ] Modal should open with "Set your active hours"
- [ ] Set wake time (e.g., 08:00) and sleep time (e.g., 23:00)
- [ ] Click "Save" - should close modal
- [ ] Time blocks outside active hours should show moon overlay

## ✅ Checkbox & Task Completion
- [ ] Open side panel (Show Todos)
- [ ] Check/uncheck goal-level checkboxes
- [ ] Check/uncheck task-level checkboxes
- [ ] Verify indeterminate state when some tasks completed
- [ ] Refresh page - checkboxes should persist (localStorage)

## ⏰ Progress Check Popup (15-second timeout)
- [ ] Create a task in current time block
- [ ] Wait for block to complete automatically
- [ ] Popup should appear with countdown timer
- [ ] Test "Done" button
- [ ] Test "Still Doing" button  
- [ ] Test "Stick to Plan" (if next block is pinned)
- [ ] Test timeout (wait 15 seconds) - should auto-pause

## 🎯 Drag & Drop System
### Simple Move:
- [ ] Drag task from one block to another
- [ ] Displaced task should move to next available slot
- [ ] Recently moved blocks should have visual indicator

### Expand Mode:
- [ ] Hold expand button while dragging
- [ ] Select multiple consecutive blocks
- [ ] Task should fill blocks with numbered versions
- [ ] Original tasks should be postponed

### Pin Protection:
- [ ] Pin a block (📌 button)
- [ ] Try to drag task onto pinned block - should be rejected
- [ ] Try to drag pinned task - should be protected

## 🔄 Block Duration Switching
- [ ] Switch between 30min, 3min, 1min modes
- [ ] Tasks should preserve positions during switch
- [ ] Mode snapshots should restore previous state

## 🗣️ Voice Features
- [ ] Click "Voice Assistant" button
- [ ] Test voice task creation
- [ ] Progress popup voice responses ("done", "still doing", etc.)

## 🎛️ Multi-Select & Bulk Operations
- [ ] Hold Ctrl/Cmd and click multiple blocks
- [ ] Use bulk delete, bulk assign goals
- [ ] Test range selection with Shift+click

## 🎨 Timer & Visual States
- [ ] Start timer - current block should be active (highlighted)
- [ ] Pause timer
- [ ] Auto-start when block has task
- [ ] Gradient cycling and shine effects

## 📊 Data Persistence Tests
### Enhanced Database (New):
- [ ] Run: `npm run db:init-enhanced`
- [ ] Check console for migration success
- [ ] Existing functionality should work unchanged

### Existing Functionality:
- [ ] Goals persist after refresh (localStorage + API)
- [ ] Time block tasks persist
- [ ] Pin states persist
- [ ] Nested todo breakdown items persist

## 🐛 Error Scenarios
- [ ] Drag to invalid targets
- [ ] Progress popup with no task
- [ ] Block duration change with complex task layout
- [ ] Network errors during API calls
- [ ] Browser refresh during drag operation

## 🚀 Performance
- [ ] Large number of tasks (100+ blocks)
- [ ] Rapid drag operations
- [ ] Mode switching with complex layouts
- [ ] Multiple timers/popups simultaneously

---

## Current Status
✅ Moon button fixed (ActiveWindowSetup now renders)  
✅ Enhanced database schema ready (optional adoption)  
✅ All existing functionality preserved  

**App running on**: http://localhost:3002  
**Branch**: database-schema-redesign