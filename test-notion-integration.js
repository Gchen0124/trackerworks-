#!/usr/bin/env node

/**
 * Notion Database Integration Test Script
 * Tests saving records to both Task Calendar and Daily Ritual databases
 */

const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};

envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      env[key.trim()] = valueParts.join('=').trim();
    }
  }
});

// Configuration from .env.local
const NOTION_API_KEY = env.NOTION_API_KEY || process.env.NOTION_API_KEY;
const TASK_CALENDAR_DB = env.NOTION_TASK_CALENDAR_DB || process.env.NOTION_TASK_CALENDAR_DB;
const DAILY_RITUAL_DB = env.NOTION_DAILY_RITUAL_DB || process.env.NOTION_DAILY_RITUAL_DB;
const DR_DATE_PROP = env.NOTION_DR_DATE_PROP || process.env.NOTION_DR_DATE_PROP || 'Date';

// Initialize Notion client
const notion = new Client({
  auth: NOTION_API_KEY,
  notionVersion: '2025-09-03',
});

// Test utilities
function logSuccess(message) {
  console.log('\x1b[32m✓\x1b[0m', message);
}

function logError(message, error) {
  console.error('\x1b[31m✗\x1b[0m', message);
  if (error) console.error('  Error:', error.message);
}

function logInfo(message) {
  console.log('\x1b[36mℹ\x1b[0m', message);
}

function logSection(title) {
  console.log('\n\x1b[1m' + '='.repeat(60) + '\x1b[0m');
  console.log('\x1b[1m' + title + '\x1b[0m');
  console.log('\x1b[1m' + '='.repeat(60) + '\x1b[0m');
}

// Test 1: Verify environment variables
async function testEnvironment() {
  logSection('Test 1: Environment Configuration');

  const checks = [
    { name: 'NOTION_API_KEY', value: NOTION_API_KEY },
    { name: 'NOTION_TASK_CALENDAR_DB', value: TASK_CALENDAR_DB },
    { name: 'NOTION_DAILY_RITUAL_DB', value: DAILY_RITUAL_DB },
    { name: 'NOTION_DR_DATE_PROP', value: DR_DATE_PROP },
  ];

  let allPresent = true;
  for (const check of checks) {
    if (check.value) {
      logSuccess(`${check.name} is set`);
    } else {
      logError(`${check.name} is missing`);
      allPresent = false;
    }
  }

  return allPresent;
}

// Test 2: Verify database access
async function testDatabaseAccess() {
  logSection('Test 2: Database Access Verification');

  // Test Task Calendar database
  try {
    const taskCalDb = await notion.dataSources.retrieve({
      data_source_id: TASK_CALENDAR_DB,
    });
    logSuccess(`Task Calendar database accessible: "${getTitleFromObject(taskCalDb)}"`);
    logInfo(`  Properties: ${Object.keys(taskCalDb.properties || {}).join(', ')}`);
  } catch (error) {
    logError('Failed to access Task Calendar database', error);
    return false;
  }

  // Test Daily Ritual database
  try {
    const dailyRitualDb = await notion.dataSources.retrieve({
      data_source_id: DAILY_RITUAL_DB,
    });
    logSuccess(`Daily Ritual database accessible: "${getTitleFromObject(dailyRitualDb)}"`);
    logInfo(`  Properties: ${Object.keys(dailyRitualDb.properties || {}).join(', ')}`);
  } catch (error) {
    logError('Failed to access Daily Ritual database', error);
    return false;
  }

  return true;
}

// Test 3: Query existing records
async function testQueryRecords() {
  logSection('Test 3: Query Existing Records');

  // Query Task Calendar
  try {
    const taskCalResults = await notion.dataSources.query({
      data_source_id: TASK_CALENDAR_DB,
      page_size: 5,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    });
    logSuccess(`Task Calendar: Retrieved ${taskCalResults.results.length} records`);
    if (taskCalResults.results.length > 0) {
      const firstTask = taskCalResults.results[0];
      logInfo(`  Latest task: "${getTitleFromPage(firstTask)}"`);
    }
  } catch (error) {
    logError('Failed to query Task Calendar', error);
    return false;
  }

  // Query Daily Ritual
  try {
    const dailyRitualResults = await notion.dataSources.query({
      data_source_id: DAILY_RITUAL_DB,
      page_size: 5,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    });
    logSuccess(`Daily Ritual: Retrieved ${dailyRitualResults.results.length} records`);
    if (dailyRitualResults.results.length > 0) {
      const firstEntry = dailyRitualResults.results[0];
      logInfo(`  Latest entry: "${getTitleFromPage(firstEntry)}"`);
    }
  } catch (error) {
    logError('Failed to query Daily Ritual', error);
    return false;
  }

  return true;
}

// Test 4: Test saving schedule to Daily Ritual
async function testSaveSchedule() {
  logSection('Test 4: Save Schedule to Daily Ritual');

  const today = new Date().toISOString().split('T')[0];

  try {
    // Find today's Daily Ritual page
    logInfo(`Looking for Daily Ritual page for date: ${today}`);

    const page = await findDailyRitualByDate(today);

    if (!page) {
      logError(`No Daily Ritual page found for ${today}`);
      logInfo('  Note: The save-schedule endpoint only searches for existing pages, it does not create them.');
      logInfo(`  Please create a Daily Ritual page with date property "${DR_DATE_PROP}" = "${today}" first.`);
      return false;
    }

    logSuccess(`Found Daily Ritual page: "${getTitleFromPage(page)}"`);
    logInfo(`  Page ID: ${page.id}`);

    // Create test schedule data
    const testSchedule = [
      {
        start_time: '09:00',
        end_time: '10:00',
        duration_min: 60,
        task_title: 'Test Task - Morning Review',
        goal_label: 'Planning',
        is_completed: '1',
        is_active: '0',
      },
      {
        start_time: '10:00',
        end_time: '11:30',
        duration_min: 90,
        task_title: 'Test Task - Code Development',
        goal_label: 'Output',
        is_completed: '0',
        is_active: '1',
      },
    ];

    // Append schedule blocks
    const timestamp = new Date().toLocaleTimeString();
    const children = buildScheduleBlocks(testSchedule, timestamp);

    await notion.blocks.children.append({
      block_id: page.id,
      children,
    });

    logSuccess('Schedule successfully appended to Daily Ritual page');
    logInfo(`  ${children.length} blocks added with timestamp: ${timestamp}`);
    logInfo(`  View the page at: ${page.url}`);

    return true;
  } catch (error) {
    logError('Failed to save schedule to Daily Ritual', error);
    return false;
  }
}

// Test 5: Test searching for a specific date
async function testDateSearch() {
  logSection('Test 5: Date Search with Multiple Strategies');

  const testDate = new Date().toISOString().split('T')[0];
  logInfo(`Testing date search for: ${testDate}`);

  const page = await findDailyRitualByDate(testDate);

  if (page) {
    logSuccess(`Found page using one of the search strategies`);
    logInfo(`  Page title: "${getTitleFromPage(page)}"`);
    logInfo(`  Page ID: ${page.id}`);
    logInfo(`  Last edited: ${page.last_edited_time}`);
    return true;
  } else {
    logError(`No page found for date: ${testDate}`);
    logInfo('  This is expected if you haven\'t created a Daily Ritual page for today yet.');
    return false;
  }
}

// Helper: Find Daily Ritual page by date (mirrors backend logic)
async function findDailyRitualByDate(dateStr) {
  // Strategy 1: Query by configured date property
  try {
    const db = await notion.dataSources.retrieve({ data_source_id: DAILY_RITUAL_DB });
    const prop = db?.properties?.[DR_DATE_PROP];
    const propType = prop?.type || 'unknown';

    let filter;
    if (propType === 'date') {
      filter = { property: DR_DATE_PROP, date: { equals: dateStr } };
    } else if (propType === 'title') {
      filter = { property: DR_DATE_PROP, title: { equals: dateStr } };
    } else if (propType === 'rich_text') {
      filter = { property: DR_DATE_PROP, rich_text: { equals: dateStr } };
    } else {
      filter = { property: DR_DATE_PROP, title: { equals: dateStr } };
    }

    const response = await notion.dataSources.query({
      data_source_id: DAILY_RITUAL_DB,
      filter,
      page_size: 1,
    });

    if (response.results?.[0]) {
      logInfo('  ✓ Strategy 1 (configured date property) succeeded');
      return response.results[0];
    }
  } catch (e) {
    logInfo('  ✗ Strategy 1 failed: ' + e.message);
  }

  // Strategy 2: Try known alternate date property names
  const fallbackProps = ['Date on Daily RItual', 'Date on Daily Ritual'];
  for (const propName of fallbackProps) {
    try {
      const response = await notion.dataSources.query({
        data_source_id: DAILY_RITUAL_DB,
        filter: { property: propName, date: { equals: dateStr } },
        page_size: 1,
      });

      if (response.results?.[0]) {
        logInfo(`  ✓ Strategy 2 (fallback property "${propName}") succeeded`);
        return response.results[0];
      }
    } catch (e) {
      logInfo(`  ✗ Strategy 2 (fallback "${propName}") failed`);
    }
  }

  // Strategy 3: Scan recent pages
  try {
    const recentPages = await notion.dataSources.query({
      data_source_id: DAILY_RITUAL_DB,
      page_size: 100,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    });

    for (const page of recentPages.results || []) {
      const props = page?.properties || {};
      for (const prop of Object.values(props)) {
        if (!prop || typeof prop !== 'object') continue;

        if (prop.type === 'date') {
          const start = prop.date?.start ? String(prop.date.start).slice(0, 10) : '';
          if (start === dateStr) {
            logInfo('  ✓ Strategy 3 (scan recent pages - date match) succeeded');
            return page;
          }
        }

        if (prop.type === 'title' || prop.type === 'rich_text') {
          const text = Array.isArray(prop[prop.type])
            ? prop[prop.type].map(t => t?.plain_text || '').join('').trim()
            : '';
          if (text === dateStr) {
            logInfo('  ✓ Strategy 3 (scan recent pages - text match) succeeded');
            return page;
          }
        }
      }
    }
  } catch (e) {
    logInfo('  ✗ Strategy 3 failed: ' + e.message);
  }

  return undefined;
}

// Helper: Build schedule blocks (mirrors backend)
function buildScheduleBlocks(scheduleData, updatedAtLabel) {
  const scheduleMarkdown = formatScheduleAsMarkdown(scheduleData);

  return [
    {
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: `📅 Schedule Log - Updated ${updatedAtLabel}`,
            },
          },
        ],
      },
    },
    {
      object: 'block',
      type: 'code',
      code: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: scheduleMarkdown,
            },
          },
        ],
        language: 'plain text',
      },
    },
    {
      object: 'block',
      type: 'divider',
      divider: {},
    },
  ];
}

function formatScheduleAsMarkdown(scheduleData) {
  const completed = scheduleData.filter(b => b.is_completed === '1');
  const active = scheduleData.filter(b => b.is_active === '1');
  const planned = scheduleData.filter(b => b.task_title && b.is_completed !== '1' && b.is_active !== '1');

  let markdown = `Summary: ${completed.length} completed, ${active.length} active, ${planned.length} planned\n\n`;

  if (completed.length > 0) {
    markdown += '✅ COMPLETED:\n';
    completed.forEach(b => {
      markdown += `  ${b.start_time}-${b.end_time} (${b.duration_min}min) ${b.task_title || '(empty)'}`;
      if (b.goal_label) markdown += ` [${b.goal_label}]`;
      markdown += '\n';
    });
    markdown += '\n';
  }

  if (active.length > 0) {
    markdown += '⏳ ACTIVE:\n';
    active.forEach(b => {
      markdown += `  ${b.start_time}-${b.end_time} (${b.duration_min}min) ${b.task_title || '(empty)'}`;
      if (b.goal_label) markdown += ` [${b.goal_label}]`;
      markdown += '\n';
    });
    markdown += '\n';
  }

  if (planned.length > 0) {
    markdown += '📋 PLANNED:\n';
    planned.forEach(b => {
      markdown += `  ${b.start_time}-${b.end_time} (${b.duration_min}min) ${b.task_title || '(empty)'}`;
      if (b.goal_label) markdown += ` [${b.goal_label}]`;
      markdown += '\n';
    });
  }

  return markdown;
}

// Helper functions
function getTitleFromObject(obj) {
  const arr = obj?.title;
  if (!Array.isArray(arr)) return 'Untitled';
  return arr.map(t => t.plain_text || t.text?.content || '').join('').trim() || 'Untitled';
}

function getTitleFromPage(page) {
  const props = page.properties || {};
  for (const [, value] of Object.entries(props)) {
    if (value?.type === 'title') {
      const arr = value.title || [];
      const title = arr.map(t => t.plain_text || t.text?.content || '').join('').trim();
      if (title) return title;
    }
  }
  return 'Untitled';
}

// Main test runner
async function runTests() {
  console.log('\n\x1b[1m\x1b[35m╔════════════════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[1m\x1b[35m║  Notion Database Integration Test Suite                    ║\x1b[0m');
  console.log('\x1b[1m\x1b[35m╚════════════════════════════════════════════════════════════╝\x1b[0m\n');

  const results = {
    passed: 0,
    failed: 0,
  };

  try {
    // Run all tests
    if (await testEnvironment()) results.passed++; else results.failed++;
    if (await testDatabaseAccess()) results.passed++; else results.failed++;
    if (await testQueryRecords()) results.passed++; else results.failed++;
    if (await testDateSearch()) results.passed++; else results.failed++;
    if (await testSaveSchedule()) results.passed++; else results.failed++;

    // Summary
    logSection('Test Summary');
    console.log(`Total Tests: ${results.passed + results.failed}`);
    console.log(`\x1b[32mPassed: ${results.passed}\x1b[0m`);
    console.log(`\x1b[31mFailed: ${results.failed}\x1b[0m`);

    if (results.failed === 0) {
      console.log('\n\x1b[1m\x1b[32m✓ All tests passed! Your Notion integration is working correctly.\x1b[0m\n');
    } else {
      console.log('\n\x1b[1m\x1b[33m⚠ Some tests failed. Please review the errors above.\x1b[0m\n');
    }

    process.exit(results.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n\x1b[31mFatal error during test execution:\x1b[0m', error);
    process.exit(1);
  }
}

// Run tests
runTests();
