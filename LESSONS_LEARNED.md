# Lessons Learned

## Critical Issues to Avoid

### 1. **Exact Property Name Matching with Notion** ⚠️

**Date:** 2026-01-07

**Issue:** Goal 2 and Goal 3 subtasks weren't loading in the to-do sidebar because property names in `.env.local` didn't EXACTLY match the Notion database property names.

**Root Cause:**
- Notion database had: `"✅ Goal 2"` and `"✅ Goal 3"` (with space after checkmark emoji)
- `.env.local` had: `"✅Goal 2"` and `"✅Goal 3"` (no space after checkmark)
- Even a single space character difference causes the API to return empty arrays `[]` instead of relation IDs

**Symptoms:**
- API returns `goalIds: [id1, null, null]` - only first goal has ID
- Frontend shows goal titles but subtasks don't load
- No obvious error messages - just silently fails

**Solution:**
```bash
# WRONG:
NOTION_DR_GOAL2_PROP=✅Goal 2

# CORRECT (match Notion exactly):
NOTION_DR_GOAL2_PROP=✅ Goal 2  # <-- space after ✅
```

**How to Debug:**
1. Use Notion MCP to fetch the page and inspect property names
2. Add console.log in API routes to log exact property names being used
3. Compare character-by-character, including spaces, emojis, and special characters

**Prevention:**
- Always copy property names directly from Notion instead of typing them
- Add validation/logging in API routes to warn about missing properties
- Use Notion's property ID instead of name when possible (more stable)

### 2. **Midnight Date Transition Issues**

**Related Fix:** Auto-refresh functionality added to detect date changes at midnight

**Issue:** Component was initialized with date on mount but didn't update when date changed

**Solution:** Added `useEffect` to check date every minute and at calculated midnight time, triggering refresh when date changes

---

## Configuration Checklist

When setting up Notion integration:

- [ ] Copy property names EXACTLY from Notion (including all spaces, emojis, special chars)
- [ ] Test with console.log to verify property names match
- [ ] Verify relation properties return IDs, not empty arrays
- [ ] Test all three goals, not just the first one
- [ ] Check both Today's Focus (main page) AND To-Do sidebar (subtasks)
- [ ] Test date transitions (yesterday → today)
