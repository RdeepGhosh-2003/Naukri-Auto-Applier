/**
 * Naukri Automated Job Application - Background Service Worker (Manifest V3)
 * Implements Promise Queue Mutex for atomic accounting, tab navigation,
 * multi-role search queue, recruiter contact logging, and desktop notifications.
 */

// Local date key as YYYY-MM-DD
function getLocalDateKey(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const notificationTabMap = new Map();
const pendingDetailApplies = new Map();

// Helper to push live log message to storage and broadcast to popup
async function appendSessionLog(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const logItem = { timestamp, message, type };

  try {
    const data = await chrome.storage.local.get(['sessionLogs']);
    const logs = data.sessionLogs || [];
    logs.push(logItem);
    if (logs.length > 200) logs.shift();

    await chrome.storage.local.set({ sessionLogs: logs });
    chrome.runtime.sendMessage({ action: 'NEW_LOG', log: logItem }).catch(() => {});
  } catch (err) {
    console.error('[Background] Failed to append log:', err);
  }
}

// ============================================================================
// 1. PROMISE QUEUE MUTEX: STRICT ACCOUNTING INVARIANT (Scanned = Applied + Saved + Skipped)
// ============================================================================
let statsUpdateQueue = Promise.resolve();

function updateSessionStats(delta) {
  statsUpdateQueue = statsUpdateQueue.then(async () => {
    try {
      const data = await chrome.storage.local.get(['autoApplySession', 'analyticsHistory']);
      const session = data.autoApplySession || {
        isRunning: false,
        stats: { scanned: 0, applied: 0, saved: 0, skipped: 0 }
      };
      session.skipReasons = session.skipReasons || {};

      if (delta.applied) session.stats.applied = (session.stats.applied || 0) + delta.applied;
      if (delta.saved) session.stats.saved = (session.stats.saved || 0) + delta.saved;
      if (delta.skipped) {
        session.stats.skipped = (session.stats.skipped || 0) + delta.skipped;
        if (delta.reason) {
          session.skipReasons[delta.reason] = (session.skipReasons[delta.reason] || 0) + delta.skipped;
        }
      }

      // ENFORCE MATHEMATICAL INVARIANT:
      session.stats.scanned = (session.stats.applied || 0) + (session.stats.saved || 0) + (session.stats.skipped || 0);

      const today = getLocalDateKey();
      const history = data.analyticsHistory || {};
      if (!history[today]) {
        history[today] = {
          date: today,
          scanned: 0,
          applied: 0,
          saved: 0,
          skipped: 0,
          sessions: session.isRunning ? 1 : 0,
          skipReasons: {},
          lastUpdated: Date.now()
        };
      }
      history[today].skipReasons = history[today].skipReasons || {};

      if (delta.applied) history[today].applied = (history[today].applied || 0) + delta.applied;
      if (delta.saved) history[today].saved = (history[today].saved || 0) + delta.saved;
      if (delta.skipped) {
        history[today].skipped = (history[today].skipped || 0) + delta.skipped;
        if (delta.reason) {
          history[today].skipReasons[delta.reason] = (history[today].skipReasons[delta.reason] || 0) + delta.skipped;
        }
      }

      history[today].scanned = (history[today].applied || 0) + (history[today].saved || 0) + (history[today].skipped || 0);
      history[today].lastUpdated = Date.now();

      await chrome.storage.local.set({
        autoApplySession: session,
        analyticsHistory: history
      });

      // Update badge
      if (session.isRunning) {
        chrome.action.setBadgeText({ text: String(session.stats.applied || 0) }).catch(() => {});
        chrome.action.setBadgeBackgroundColor({ color: '#059669' }).catch(() => {});
      }

      chrome.runtime.sendMessage({
        action: 'STATS_UPDATED',
        stats: session.stats,
        skipReasons: session.skipReasons
      }).catch(() => {});

      chrome.runtime.sendMessage({
        action: 'ANALYTICS_UPDATED',
        history
      }).catch(() => {});
    } catch (err) {
      console.error('[Background] Stats mutex error:', err);
    }
  }).catch(err => console.error('[Background] Queue error:', err));

  return statsUpdateQueue;
}

/**
 * Self-healing reconciliation algorithm for legacy/interrupted counts
 */
async function reconcileAnalyticsHistory() {
  try {
    const data = await chrome.storage.local.get(['autoApplySession', 'analyticsHistory']);
    let modified = false;

    if (data.autoApplySession?.stats) {
      const s = data.autoApplySession.stats;
      const expected = (s.applied || 0) + (s.saved || 0) + (s.skipped || 0);
      if (s.scanned !== expected) {
        s.scanned = expected;
        modified = true;
      }
    }

    if (data.analyticsHistory) {
      for (const dateKey of Object.keys(data.analyticsHistory)) {
        const rec = data.analyticsHistory[dateKey];
        const expected = (rec.applied || 0) + (rec.saved || 0) + (rec.skipped || 0);
        if (rec.scanned !== expected) {
          rec.scanned = expected;
          modified = true;
        }
      }
    }

    if (modified) {
      await chrome.storage.local.set({
        autoApplySession: data.autoApplySession,
        analyticsHistory: data.analyticsHistory
      });
      console.log('[Background] Historical records reconciled.');
    }
  } catch (err) {
    console.error('[Background] Reconciliation error:', err);
  }
}

// ============================================================================
// 2. NAUKRI SEARCH URL BUILDER
// ============================================================================
function buildNaukriSearchUrl(query, location, experience, freshness) {
  const cleanQ = (query || 'Data Analyst').trim();
  const cleanLoc = (location || '').trim();

  // Create clean URL slugs
  const slugQ = cleanQ.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'data-analyst';
  let slugLoc = cleanLoc.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  if (slugLoc === 'all-india') {
    slugLoc = 'india';
  }

  let baseUrl = '';
  if (slugLoc) {
    baseUrl = `https://www.naukri.com/${slugQ}-jobs-in-${slugLoc}`;
  } else {
    baseUrl = `https://www.naukri.com/${slugQ}-jobs`;
  }

  const params = new URLSearchParams();

  // Freshness (Job Age): '1' (24h), '3', '7', '15', '30' or 'all'
  const cleanFreshness = freshness !== undefined && freshness !== null ? String(freshness).trim() : '1';
  

  if (experience !== undefined && experience !== null && experience !== '') {
    params.set('experience', String(experience));
  }

  const queryString = params.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

// ============================================================================
// 3. SESSION MANAGEMENT & MULTI-ROLE QUEUE
// ============================================================================
async function handleStartAutoApply(settings) {
  await reconcileAnalyticsHistory();

  const queryQueue = (settings.targetJobQuery || 'Data Analyst')
    .split(/[,;]/)
    .map(q => q.trim())
    .filter(q => q.length > 0);

  const initialQuery = queryQueue[0] || 'Data Analyst';
  const initialUrl = buildNaukriSearchUrl(
    initialQuery,
    settings.targetLocation,
    settings.userYearsExp,
    settings.jobFreshness
  );

  const session = {
    isRunning: true,
    isPaused: false,
    startedAt: Date.now(),
    settings,
    queryQueue,
    currentQueryIndex: 0,
    processedJobIds: [],
    stats: { scanned: 0, applied: 0, saved: 0, skipped: 0 },
    skipReasons: {
      ai_spam: 0,
      title_relevance: 0,
      freshness: 0,
      blacklist: 0,
      company: 0,
      location: 0,
      salary: 0,
      experience: 0,
      already_applied: 0,
      easy_apply: 0,
      unrecognized: 0
    }
  };

  // Create or navigate tab
  const tab = await chrome.tabs.create({ url: initialUrl, active: true });
  session.tabId = tab.id;

  await chrome.storage.local.set({ autoApplySession: session });
  const freshnessLabel = settings.jobFreshness === 'all'
    ? 'All time'
    : (settings.jobFreshness ? `Last ${settings.jobFreshness} day(s)` : 'Last 1 day');
  await appendSessionLog(`🚀 Auto-Apply session started for query: "${initialQuery}" in "${settings.targetLocation || 'All India'}" (${freshnessLabel})`, 'info');

  chrome.action.setBadgeText({ text: '0' });
  chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });

  return { success: true, tabId: tab.id };
}

async function handleStopAutoApply() {
  const data = await chrome.storage.local.get(['autoApplySession']);
  const session = data.autoApplySession;
  if (!session) return { success: true };

  session.isRunning = false;
  session.isPaused = false;
  await chrome.storage.local.set({ autoApplySession: session });

  await appendSessionLog(`⏹️ Session stopped by user. Applied: ${session.stats?.applied || 0}, Saved: ${session.stats?.saved || 0}, Skipped: ${session.stats?.skipped || 0}`, 'warning');

  chrome.action.setBadgeText({ text: '' });
  chrome.runtime.sendMessage({ action: 'SESSION_STOPPED', session }).catch(() => {});

  if (session.tabId) {
    chrome.tabs.sendMessage(session.tabId, { action: 'HALT_ENGINE' }).catch(() => {});
  }

  return { success: true };
}

async function handleQueryResultsFinished() {
  const data = await chrome.storage.local.get(['autoApplySession']);
  const session = data.autoApplySession;
  if (!session || !session.isRunning) return;

  const queue = session.queryQueue || [];
  const nextIndex = (session.currentQueryIndex || 0) + 1;

  if (nextIndex < queue.length) {
    session.currentQueryIndex = nextIndex;
    const nextQuery = queue[nextIndex];
    if (!nextQuery) {
      await handleSessionCompleted();
      return;
    }

    const nextUrl = buildNaukriSearchUrl(
      nextQuery,
      session.settings.targetLocation,
      session.settings.userYearsExp,
      session.settings.jobFreshness
    );

    await chrome.storage.local.set({ autoApplySession: session });
    await appendSessionLog(`🔄 Finished role #${nextIndex}. Advancing search queue to: "${nextQuery}"...`, 'info');

    if (session.tabId) {
      await chrome.tabs.update(session.tabId, { url: nextUrl, active: true });
    }
  } else {
    await handleSessionCompleted();
  }
}

async function handleSessionCompleted() {
  const data = await chrome.storage.local.get(['autoApplySession']);
  const session = data.autoApplySession;
  if (!session) return;

  session.isRunning = false;
  await chrome.storage.local.set({ autoApplySession: session });

  await appendSessionLog(`🎉 All queue roles completed! Total Applied: ${session.stats?.applied || 0}, Saved: ${session.stats?.saved || 0}`, 'success');

  chrome.action.setBadgeText({ text: 'DONE' });
  chrome.action.setBadgeBackgroundColor({ color: '#059669' });

  if (session.tabId) {
    chrome.tabs.sendMessage(session.tabId, { action: 'SESSION_COMPLETED' }).catch(() => {});
  }

  chrome.runtime.sendMessage({ action: 'SESSION_COMPLETED', stats: session.stats }).catch(() => {});
}

// ============================================================================
// 4. RECORD SAVED & APPLIED JOBS (WITH CONTACT INFO & INDICATOR)
// ============================================================================
async function handleSaveJob(job) {
  try {
    const data = await chrome.storage.local.get(['savedJobs']);
    const savedJobs = data.savedJobs || [];

    const exists = savedJobs.some(j => (j.id && j.id === job.id) || (j.url && j.url === job.url));
    if (!exists) {
      const newJob = {
        ...job,
        savedAt: new Date().toLocaleString('en-US', {
          year: 'numeric', month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit'
        })
      };
      savedJobs.unshift(newJob);
      if (savedJobs.length > 500) savedJobs.pop();

      await chrome.storage.local.set({ savedJobs });
    }

    // Update stats atomically
    await updateSessionStats({ saved: 1 });

    const contactNote = job.contactInfo?.email || job.contactInfo?.phone
      ? ` [📞 ${job.contactInfo.email || ''} ${job.contactInfo.phone || ''}]`
      : '';
    await appendSessionLog(`📋 Saved Job: "${job.title}" at "${job.company}" (${job.reason || 'Manual Review'})${contactNote}`, 'info');

    return { success: true };
  } catch (err) {
    console.error('[Background] Save job error:', err);
    return { success: false, error: err.message };
  }
}

async function handleJobApplied(job) {
  try {
    const data = await chrome.storage.local.get(['appliedJobs']);
    const appliedJobs = data.appliedJobs || [];

    const exists = appliedJobs.some(j => (j.id && j.id === job.id) || (j.url && j.url === job.url));
    if (!exists) {
      const newJob = {
        ...job,
        appliedAt: new Date().toLocaleString('en-US', {
          year: 'numeric', month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit'
        })
      };
      appliedJobs.unshift(newJob);
      if (appliedJobs.length > 500) appliedJobs.pop();

      await chrome.storage.local.set({ appliedJobs });
    }

    // Update stats atomically
    await updateSessionStats({ applied: 1 });

    await appendSessionLog(`✅ Applied: "${job.title}" at "${job.company}"!`, 'success');

    // Also if job had direct recruiter contact, save a copy in savedJobs tagged as Contact Available!
    if (job.contactInfo?.email || job.contactInfo?.phone) {
      const sData = await chrome.storage.local.get(['savedJobs']);
      const sJobs = sData.savedJobs || [];
      if (!sJobs.some(j => (j.id && j.id === job.id) || (j.url && j.url === job.url))) {
        sJobs.unshift({
          ...job,
          reason: 'Applied + 📞 Direct Recruiter Contact',
          savedAt: new Date().toLocaleString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
          })
        });
        await chrome.storage.local.set({ savedJobs: sJobs });
      }
    }

    return { success: true };
  } catch (err) {
    console.error('[Background] Job applied error:', err);
    return { success: false, error: err.message };
  }
}

// ============================================================================
// 4B. DETAIL PAGE APPLICATION IN CHILD TAB (FULL-PAGE LISTING ORCHESTRATION)
// ============================================================================


// ============================================================================
// 5. RUNTIME MESSAGE DISPATCHER
// ============================================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_AUTO_APPLY') {
    handleStartAutoApply(request.settings)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'STOP_AUTO_APPLY') {
    handleStopAutoApply()
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'QUERY_RESULTS_FINISHED') {
    handleQueryResultsFinished()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'UPDATE_STATS') {
    updateSessionStats(request.delta || {})
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'SAVE_JOB' && request.job) {
    handleSaveJob(request.job)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'JOB_APPLIED' && request.job) {
    handleJobApplied(request.job)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'APPEND_LOG') {
    appendSessionLog(request.message, request.logType || 'info')
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'RECONCILE_STATS') {
    reconcileAnalyticsHistory()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'CLEAR_ANALYTICS_HISTORY') {
    chrome.storage.local.set({ analyticsHistory: {} }, () => {
      chrome.runtime.sendMessage({ action: 'ANALYTICS_UPDATED', history: {} }).catch(() => {});
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === 'NOTIFY_CAPTCHA' && sender.tab) {
    const tabId = sender.tab.id;
    const notifId = `captcha_${tabId}_${Date.now()}`;
    notificationTabMap.set(notifId, { tabId });

    chrome.tabs.sendMessage(tabId, { action: 'PLAY_ALERT_CHIME' }).catch(() => {});

    if (chrome.notifications) {
      chrome.notifications.create(notifId, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon48.png'),
        title: '⚠️ CAPTCHA Detected on Naukri!',
        message: 'A verification challenge was detected. Click here to solve it.',
        priority: 2,
        requireInteraction: true
      });
    }
    sendResponse({ success: true });
    return true;
  }

  // Forward message to active tab (e.g. subframe coordination)
  if (request.action === 'FORWARD_TO_ACTIVE_TAB') {
    chrome.storage.local.get(['autoApplySession'], (data) => {
      const tabId = data.autoApplySession?.tabId;
      if (tabId) {
        chrome.tabs.sendMessage(tabId, request.message, (resp) => {
          sendResponse(resp);
        });
      } else {
        sendResponse(null);
      }
    });
    return true;
  }

  if (request.action === 'APPLY_JOB_IN_TAB' && request.job) {
    handleApplyJobInTab(request.job, sender.tab?.id)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ status: 'saved', reason: err.message }));
    return true;
  }

  if (request.action === 'DETAIL_APPLY_FINISHED' && sender.tab) {
    handleDetailApplyFinished(sender.tab.id, request)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// Click notification switches to that tab
if (chrome.notifications && chrome.notifications.onClicked) {
  chrome.notifications.onClicked.addListener((notifId) => {
    const entry = notificationTabMap.get(notifId);
    if (entry && entry.tabId) {
      chrome.tabs.update(entry.tabId, { active: true });
    }
  });
}

// Watch for tab closure: safely clean up pending detail apply or halt session if search tab closed
chrome.tabs.onRemoved.addListener(async (closedTabId) => {
  if (pendingDetailApplies.has(closedTabId)) {
    const entry = pendingDetailApplies.get(closedTabId);
    clearTimeout(entry.timeoutId);
    pendingDetailApplies.delete(closedTabId);
    entry.resolve({ status: 'saved', reason: 'tab_closed_manually' });
  }

  const data = await chrome.storage.local.get(['autoApplySession']);
  const session = data.autoApplySession;
  if (session && session.isRunning && session.tabId === closedTabId) {
    await handleStopAutoApply();
    await appendSessionLog('⚠️ Naukri search tab was closed. Auto-Apply paused.', 'warning');
  }
});

// Backup signal for detail tab execution when page completes loading
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (pendingDetailApplies.has(tabId) && changeInfo.status === 'complete') {
    chrome.tabs.sendMessage(tabId, { action: 'EXECUTE_DETAIL_APPLY' }).catch(() => {});
  }
});

// Initial startup reconciliation
chrome.runtime.onInstalled.addListener(() => {
  reconcileAnalyticsHistory();
});
chrome.runtime.onStartup.addListener(() => {
  reconcileAnalyticsHistory();
});
