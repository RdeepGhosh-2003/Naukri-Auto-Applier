/**
 * Naukri Automated Job Application - Popup Dashboard Controller
 * Handles session controls, live stats, multi-role query queue,
 * recruiter contact badges & filters, Q&A bank editor, analytics, and CSV exports.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const sessionBadge = document.getElementById('session-badge');
  const btnStart = document.getElementById('btn-start');
  const btnResume = document.getElementById('btn-resume');
  const btnStop = document.getElementById('btn-stop');
  const btnClearLogs = document.getElementById('btn-clear-logs');
  const consoleLogs = document.getElementById('console-logs');

  const metricScanned = document.getElementById('metric-scanned');
  const metricApplied = document.getElementById('metric-applied');
  const metricSaved = document.getElementById('metric-saved');
  const metricSkipped = document.getElementById('metric-skipped');

  const progressText = document.getElementById('progress-text');
  const progressBarFill = document.getElementById('progress-bar-fill');

  // Rules elements
  const ruleQuery = document.getElementById('rule-query');
  const ruleLocation = document.getElementById('rule-location');
  const ruleFreshness = document.getElementById('rule-freshness');
  const ruleExp = document.getElementById('rule-exp');
  const ruleSalary = document.getElementById('rule-salary');
  const ruleUnlistedExp = document.getElementById('rule-unlisted-exp');
  const ruleBlacklist = document.getElementById('rule-blacklist');
  const ruleCompanyBlacklist = document.getElementById('rule-company-blacklist');
  const ruleTargetResume = document.getElementById('rule-target-resume');
  const ruleStrictLocation = document.getElementById('rule-strict-location');
  const ruleSaveContact = document.getElementById('rule-save-contact');
  const ruleBlockSpam = document.getElementById('rule-block-spam');
  const ruleTitleRelevance = document.getElementById('rule-title-relevance');
  const ruleDelay = document.getElementById('rule-delay');
  const ruleMaxJobs = document.getElementById('rule-max-jobs');
  const btnSaveRules = document.getElementById('btn-save-rules');

  // Profile elements
  const profFullName = document.getElementById('prof-fullname');
  const profPhone = document.getElementById('prof-phone');
  const profEmail = document.getElementById('prof-email');
  const profCity = document.getElementById('prof-city');
  const profCurrTitle = document.getElementById('prof-curr-title');
  const profCurrCompany = document.getElementById('prof-curr-company');
  const profYearsExp = document.getElementById('prof-years-exp');
  const profNotice = document.getElementById('prof-notice');
  const profCurrCtc = document.getElementById('prof-curr-ctc');
  const profExpectedCtc = document.getElementById('prof-expected-ctc');
  const btnSaveProfile = document.getElementById('btn-save-profile');

  // Screening Q&A elements
  const qaListContainer = document.getElementById('qa-list-container');
  const btnOpenAddQa = document.getElementById('btn-open-add-qa');
  const qaFormContainer = document.getElementById('qa-form-container');
  const qaFormTitle = document.getElementById('qa-form-title');
  const qaEditIndex = document.getElementById('qa-edit-index');
  const qaInputKeywords = document.getElementById('qa-input-keywords');
  const qaInputAnswer = document.getElementById('qa-input-answer');
  const btnCancelQa = document.getElementById('btn-cancel-qa');
  const btnSaveQa = document.getElementById('btn-save-qa');

  // Saved / Applied elements
  const viewSavedBtn = document.getElementById('view-saved-btn');
  const viewAppliedBtn = document.getElementById('view-applied-btn');
  const savedSubview = document.getElementById('saved-subview');
  const appliedSubview = document.getElementById('applied-subview');
  const savedJobsContainer = document.getElementById('saved-jobs-container');
  const appliedJobsContainer = document.getElementById('applied-jobs-container');
  const savedCountBadge = document.getElementById('saved-count-badge');
  const savedTabCount = document.getElementById('saved-tab-count');
  const appliedTabCount = document.getElementById('applied-tab-count');
  const savedSearchInput = document.getElementById('saved-search-input');
  const appliedSearchInput = document.getElementById('applied-search-input');
  const filterContactOnlyBtn = document.getElementById('filter-contact-only');
  const btnExportSaved = document.getElementById('btn-export-saved');
  const btnClearSaved = document.getElementById('btn-clear-saved');
  const btnExportApplied = document.getElementById('btn-export-applied');
  const btnClearApplied = document.getElementById('btn-clear-applied');

  // Analytics elements
  const periodBtns = document.querySelectorAll('.period-btn');
  const logsPeriodLabel = document.getElementById('logs-period-label');
  const logsSessionsCount = document.getElementById('logs-sessions-count');
  const logsProgressTitle = document.getElementById('logs-progress-title');
  const logsProgressText = document.getElementById('logs-progress-text');
  const logsProgressBarFill = document.getElementById('logs-progress-bar-fill');
  const logsMetricScanned = document.getElementById('logs-metric-scanned');
  const logsMetricApplied = document.getElementById('logs-metric-applied');
  const logsMetricSaved = document.getElementById('logs-metric-saved');
  const logsMetricSkipped = document.getElementById('logs-metric-skipped');
  const logsBreakdownContainer = document.getElementById('logs-breakdown-container');
  const btnExportLogs = document.getElementById('btn-export-logs');
  const btnClearHistory = document.getElementById('btn-clear-history');

  let currentLogsPeriod = 'daily';
  let filterContactOnly = false;

  // Tab switching
  const tabButtons = document.querySelectorAll('.nav-tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add('active');

      if (btn.dataset.tab === 'tab-saved') renderJobs();
      if (btn.dataset.tab === 'tab-logs') renderAnalytics(currentLogsPeriod);
      if (btn.dataset.tab === 'tab-profile') renderQAList();
    });
  });

  // Reconcile and load data
  chrome.runtime.sendMessage({ action: 'RECONCILE_STATS' }).catch(() => {});

  let userProfile = null;
  async function loadInitialData() {
    const data = await chrome.storage.local.get([
      'userProfile',
      'autoApplySession',
      'sessionLogs',
      'savedJobs',
      'appliedJobs',
      'theme'
    ]);

    if (data.theme === 'light') {
      document.body.setAttribute('data-theme', 'light');
      themeToggleBtn.textContent = '☀️';
    }

    if (data.userProfile) {
      userProfile = data.userProfile;
      populateProfileAndRules(userProfile);
    } else {
      fetch(chrome.runtime.getURL('data/default_profile.json'))
        .then(res => res.json())
        .then(def => {
          userProfile = def;
          chrome.storage.local.set({ userProfile: def });
          populateProfileAndRules(def);
        });
    }

    if (data.autoApplySession) {
      updateSessionUI(data.autoApplySession);
    }

    if (data.sessionLogs) {
      renderLogs(data.sessionLogs);
    }

    renderJobs();
    renderAnalytics('daily');
  }

  // Populate rules and profile inputs
  function populateProfileAndRules(prof) {
    if (!prof) return;

    // Rules
    const r = prof.autoApplierSettings || {};
    ruleQuery.value = r.targetJobQuery || '';
    ruleLocation.value = r.targetLocation || '';
    ruleFreshness.value = r.jobFreshness !== undefined ? String(r.jobFreshness) : '1';
    ruleExp.value = r.userYearsExp !== undefined ? r.userYearsExp : 1;
    ruleSalary.value = r.minMonthlySalary || 25000;
    ruleUnlistedExp.value = r.unlistedExpAction || 'apply';
    ruleBlacklist.value = r.blacklistKeywords || '';
    ruleCompanyBlacklist.value = r.blockedCompanies || '';
    ruleTargetResume.value = prof.work?.targetRole?.targetResumeName || '';
    ruleStrictLocation.checked = r.strictLocation !== false;
    ruleSaveContact.checked = r.saveContactJobs !== false;
    ruleBlockSpam.checked = r.blockAiSpam !== false;
    ruleTitleRelevance.checked = r.matchTitleRelevance !== false;
    ruleDelay.value = r.stepDelayMs || 1200;
    ruleMaxJobs.value = r.maxJobsPerSession || 25;

    // Profile
    const p = prof.personal || {};
    profFullName.value = p.fullName || '';
    profPhone.value = p.phone || '';
    profEmail.value = p.email || '';
    profCity.value = p.city || '';

    const w = prof.work || {};
    profCurrTitle.value = w.currentRole?.jobTitle || '';
    profCurrCompany.value = w.currentRole?.company || '';
    profYearsExp.value = w.currentRole?.yearsExperience || 1;
    profNotice.value = w.targetRole?.noticePeriod || 'Immediate';
    profCurrCtc.value = w.currentRole?.currentSalary || '';
    profExpectedCtc.value = w.targetRole?.expectedSalary || '';

    renderQAList();
  }

  // Update session controls and counters
  function updateSessionUI(session) {
    if (!session) return;
    const isRunning = Boolean(session.isRunning);

    if (isRunning) {
      sessionBadge.textContent = 'Running';
      sessionBadge.className = 'status-badge status-running';
      btnStart.disabled = true;
      btnStop.disabled = false;
    } else {
      sessionBadge.textContent = 'Ready';
      sessionBadge.className = 'status-badge status-idle';
      btnStart.disabled = false;
      btnStop.disabled = true;
    }

    const stats = session.stats || { scanned: 0, applied: 0, saved: 0, skipped: 0 };
    metricScanned.textContent = stats.scanned || 0;
    metricApplied.textContent = stats.applied || 0;
    metricSaved.textContent = stats.saved || 0;
    metricSkipped.textContent = stats.skipped || 0;

    const maxJobs = session.settings?.maxJobsPerSession || 25;
    progressText.textContent = `${stats.applied || 0} / ${maxJobs} Jobs`;
    const pct = Math.min(100, Math.round(((stats.applied || 0) / maxJobs) * 100));
    progressBarFill.style.width = `${pct}%`;
  }

  // Render logs
  function renderLogs(logs) {
    if (!logs || logs.length === 0) {
      consoleLogs.innerHTML = '<div class="log-entry log-info">[System] Naukri Auto-Applier ready.</div>';
      return;
    }
    consoleLogs.innerHTML = logs.map(l => {
      const cls = l.type === 'success' ? 'log-success' :
                  l.type === 'warning' ? 'log-warning' :
                  l.type === 'error' ? 'log-error' : 'log-info';
      return `<div class="log-entry ${cls}">[${l.timestamp}] ${escapeHtml(l.message)}</div>`;
    }).join('');
    consoleLogs.scrollTop = consoleLogs.scrollHeight;
  }

  function appendSingleLog(logItem) {
    const cls = logItem.type === 'success' ? 'log-success' :
                logItem.type === 'warning' ? 'log-warning' :
                logItem.type === 'error' ? 'log-error' : 'log-info';
    const div = document.createElement('div');
    div.className = `log-entry ${cls}`;
    div.textContent = `[${logItem.timestamp}] ${logItem.message}`;
    consoleLogs.appendChild(div);
    consoleLogs.scrollTop = consoleLogs.scrollHeight;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ===========================================================================
  // START & STOP AUTO-APPLY
  // ===========================================================================
  btnStart.addEventListener('click', async () => {
    btnStart.disabled = true;
    sessionBadge.textContent = 'Starting...';

    // Save rules first
    await saveRulesFromInputs();

    const currentProfile = (await chrome.storage.local.get(['userProfile'])).userProfile || userProfile;
    const settings = currentProfile.autoApplierSettings || {};

    chrome.runtime.sendMessage({ action: 'START_AUTO_APPLY', settings }, (res) => {
      if (res && res.success) {
        sessionBadge.textContent = 'Running';
        sessionBadge.className = 'status-badge status-running';
        btnStop.disabled = false;
      } else {
        sessionBadge.textContent = 'Failed';
        sessionBadge.className = 'status-badge status-idle';
        btnStart.disabled = false;
        alert('Failed to start session: ' + (res?.error || 'Unknown error'));
      }
    });
  });

  btnStop.addEventListener('click', () => {
    btnStop.disabled = true;
    sessionBadge.textContent = 'Stopping...';
    chrome.runtime.sendMessage({ action: 'STOP_AUTO_APPLY' }, () => {
      sessionBadge.textContent = 'Ready';
      sessionBadge.className = 'status-badge status-idle';
      btnStart.disabled = false;
      btnResume.style.display = 'none';
    });
  });

  btnResume.addEventListener('click', () => {
    btnResume.disabled = true;
    sessionBadge.textContent = 'Resuming...';
    chrome.runtime.sendMessage({
      action: 'FORWARD_TO_ACTIVE_TAB',
      message: { action: 'RESUME_AUTO_APPLY' }
    }, () => {
      btnResume.style.display = 'none';
      btnResume.disabled = false;
      sessionBadge.textContent = 'Running';
      sessionBadge.className = 'status-badge status-running';
    });
  });

  btnClearLogs.addEventListener('click', () => {
    chrome.storage.local.set({ sessionLogs: [] }, () => {
      consoleLogs.innerHTML = '<div class="log-entry log-info">[System] Logs cleared.</div>';
    });
  });

  // ===========================================================================
  // SAVE RULES & PROFILE
  // ===========================================================================
  async function saveRulesFromInputs() {
    const data = await chrome.storage.local.get(['userProfile']);
    const prof = data.userProfile || userProfile || {};
    prof.autoApplierSettings = prof.autoApplierSettings || {};

    prof.autoApplierSettings.targetJobQuery = ruleQuery.value.trim();
    prof.autoApplierSettings.targetLocation = ruleLocation.value.trim();
    prof.autoApplierSettings.jobFreshness = ruleFreshness.value;
    prof.autoApplierSettings.userYearsExp = parseInt(ruleExp.value, 10) || 0;
    prof.autoApplierSettings.minMonthlySalary = parseInt(ruleSalary.value, 10) || 0;
    prof.autoApplierSettings.unlistedExpAction = ruleUnlistedExp.value;
    prof.autoApplierSettings.blacklistKeywords = ruleBlacklist.value.trim();
    prof.autoApplierSettings.blockedCompanies = ruleCompanyBlacklist.value.trim();
    prof.autoApplierSettings.strictLocation = ruleStrictLocation.checked;
    prof.autoApplierSettings.saveContactJobs = ruleSaveContact.checked;
    prof.autoApplierSettings.blockAiSpam = ruleBlockSpam.checked;
    prof.autoApplierSettings.matchTitleRelevance = ruleTitleRelevance.checked;
    prof.autoApplierSettings.stepDelayMs = parseInt(ruleDelay.value, 10) || 1200;
    prof.autoApplierSettings.maxJobsPerSession = parseInt(ruleMaxJobs.value, 10) || 25;

    prof.work = prof.work || {};
    prof.work.targetRole = prof.work.targetRole || {};
    prof.work.targetRole.targetResumeName = ruleTargetResume.value.trim();

    await chrome.storage.local.set({ userProfile: prof });
    userProfile = prof;
  }

  btnSaveRules.addEventListener('click', async () => {
    await saveRulesFromInputs();
    btnSaveRules.textContent = '✅ Saved!';
    setTimeout(() => { btnSaveRules.textContent = '💾 Save Filter Rules'; }, 1500);
  });

  btnSaveProfile.addEventListener('click', async () => {
    const data = await chrome.storage.local.get(['userProfile']);
    const prof = data.userProfile || userProfile || {};

    prof.personal = prof.personal || {};
    prof.personal.fullName = profFullName.value.trim();
    prof.personal.phone = profPhone.value.trim();
    prof.personal.email = profEmail.value.trim();
    prof.personal.city = profCity.value.trim();

    prof.work = prof.work || {};
    prof.work.currentRole = prof.work.currentRole || {};
    prof.work.currentRole.jobTitle = profCurrTitle.value.trim();
    prof.work.currentRole.company = profCurrCompany.value.trim();
    prof.work.currentRole.yearsExperience = parseInt(profYearsExp.value, 10) || 1;
    prof.work.currentRole.currentSalary = profCurrCtc.value.trim();

    prof.work.targetRole = prof.work.targetRole || {};
    prof.work.targetRole.noticePeriod = profNotice.value.trim();
    prof.work.targetRole.expectedSalary = profExpectedCtc.value.trim();

    await chrome.storage.local.set({ userProfile: prof });
    userProfile = prof;
    btnSaveProfile.textContent = '✅ Saved!';
    setTimeout(() => { btnSaveProfile.textContent = '💾 Save Profile Details'; }, 1500);
  });

  // ===========================================================================
  // SCREENING Q&A BANK CRUD
  // ===========================================================================
  function renderQAList() {
    const screening = userProfile?.screening || [];
    if (screening.length === 0) {
      qaListContainer.innerHTML = '<div class="empty-state">No screening questions saved yet.</div>';
      return;
    }

    qaListContainer.innerHTML = screening.map((item, idx) => `
      <div class="qa-item">
        <div>
          <div class="qa-keys">${escapeHtml(item.keywords)}</div>
          <div class="qa-ans">➔ ${escapeHtml(item.answer)}</div>
        </div>
        <div class="qa-actions">
          <button class="btn btn-small btn-secondary btn-edit-qa" data-idx="${idx}">✏️</button>
          <button class="btn btn-small btn-danger btn-del-qa" data-idx="${idx}">🗑️</button>
        </div>
      </div>
    `).join('');

    qaListContainer.querySelectorAll('.btn-edit-qa').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        openEditQa(idx);
      });
    });

    qaListContainer.querySelectorAll('.btn-del-qa').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        userProfile.screening.splice(idx, 1);
        await chrome.storage.local.set({ userProfile });
        renderQAList();
      });
    });
  }

  btnOpenAddQa.addEventListener('click', () => {
    qaFormContainer.style.display = 'block';
    qaFormTitle.textContent = 'Add Screening Rule';
    qaEditIndex.value = '-1';
    qaInputKeywords.value = '';
    qaInputAnswer.value = '';
    qaInputKeywords.focus();
  });

  function openEditQa(idx) {
    const item = userProfile?.screening[idx];
    if (!item) return;
    qaFormContainer.style.display = 'block';
    qaFormTitle.textContent = 'Edit Screening Rule';
    qaEditIndex.value = String(idx);
    qaInputKeywords.value = item.keywords || '';
    qaInputAnswer.value = item.answer || '';
    qaInputKeywords.focus();
  }

  btnCancelQa.addEventListener('click', () => {
    qaFormContainer.style.display = 'none';
  });

  btnSaveQa.addEventListener('click', async () => {
    const keys = qaInputKeywords.value.trim();
    const ans = qaInputAnswer.value.trim();
    if (!keys || !ans) {
      alert('Please enter both question keywords and an answer.');
      return;
    }

    userProfile.screening = userProfile.screening || [];
    const editIdx = parseInt(qaEditIndex.value, 10);

    if (editIdx >= 0 && editIdx < userProfile.screening.length) {
      userProfile.screening[editIdx] = { keywords: keys, answer: ans };
    } else {
      userProfile.screening.push({ keywords: keys, answer: ans });
    }

    await chrome.storage.local.set({ userProfile });
    qaFormContainer.style.display = 'none';
    renderQAList();
  });

  // ===========================================================================
  // SAVED & APPLIED JOBS (WITH RECRUITER CONTACT BADGES & LINKS)
  // ===========================================================================
  viewSavedBtn.addEventListener('click', () => {
    viewSavedBtn.classList.add('active');
    viewAppliedBtn.classList.remove('active');
    savedSubview.classList.add('active');
    appliedSubview.classList.remove('active');
    renderJobs();
  });

  viewAppliedBtn.addEventListener('click', () => {
    viewAppliedBtn.classList.add('active');
    viewSavedBtn.classList.remove('active');
    appliedSubview.classList.add('active');
    savedSubview.classList.remove('active');
    renderJobs();
  });

  filterContactOnlyBtn.addEventListener('click', () => {
    filterContactOnly = !filterContactOnly;
    filterContactOnlyBtn.classList.toggle('active', filterContactOnly);
    renderJobs();
  });

  savedSearchInput.addEventListener('input', () => renderJobs());
  appliedSearchInput.addEventListener('input', () => renderJobs());

  async function renderJobs() {
    const data = await chrome.storage.local.get(['savedJobs', 'appliedJobs']);
    let saved = data.savedJobs || [];
    let applied = data.appliedJobs || [];

    savedTabCount.textContent = saved.length;
    savedCountBadge.textContent = saved.length;
    appliedTabCount.textContent = applied.length;

    // Filter Saved Jobs
    const savedQuery = (savedSearchInput.value || '').toLowerCase().trim();
    let filteredSaved = saved.filter(j => {
      const matchText = `${j.title} ${j.company} ${j.location} ${j.reason || ''} ${j.contactInfo?.summary || ''}`.toLowerCase();
      const textMatches = !savedQuery || matchText.includes(savedQuery);
      const contactMatches = !filterContactOnly || Boolean(j.contactInfo?.hasContact);
      return textMatches && contactMatches;
    });

    if (filteredSaved.length === 0) {
      savedJobsContainer.innerHTML = '<div class="empty-state">No matching saved jobs found.</div>';
    } else {
      savedJobsContainer.innerHTML = filteredSaved.map((j, idx) => renderJobCard(j, idx, 'saved')).join('');
    }

    // Filter Applied Jobs
    const appliedQuery = (appliedSearchInput.value || '').toLowerCase().trim();
    let filteredApplied = applied.filter(j => {
      const matchText = `${j.title} ${j.company} ${j.location}`.toLowerCase();
      return !appliedQuery || matchText.includes(appliedQuery);
    });

    if (filteredApplied.length === 0) {
      appliedJobsContainer.innerHTML = '<div class="empty-state">No matching applied jobs found.</div>';
    } else {
      appliedJobsContainer.innerHTML = filteredApplied.map((j, idx) => renderJobCard(j, idx, 'applied')).join('');
    }

    // Attach individual delete handlers
    document.querySelectorAll('.btn-del-job').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const type = e.currentTarget.dataset.type;
        const index = parseInt(e.currentTarget.dataset.idx, 10);
        if (type === 'saved') {
          saved.splice(index, 1);
          await chrome.storage.local.set({ savedJobs: saved });
        } else {
          applied.splice(index, 1);
          await chrome.storage.local.set({ appliedJobs: applied });
        }
        renderJobs();
      });
    });
  }

  function renderJobCard(job, idx, type) {
    const isSaved = type === 'saved';
    const reasonBadge = job.reason
      ? `<span class="job-badge ${job.reason.includes('Incomplete') ? 'badge-incomplete' : 'badge-reason'}">${escapeHtml(job.reason)}</span>`
      : '';

    // Contact Box
    let contactHtml = '';
    if (job.contactInfo && job.contactInfo.hasContact) {
      const phoneBtn = job.contactInfo.primaryPhone
        ? `<a href="tel:${job.contactInfo.primaryPhone}" class="contact-btn" title="Click to call recruiter">📞 +91 ${escapeHtml(job.contactInfo.primaryPhone)}</a>`
        : '';
      const emailBtn = job.contactInfo.primaryEmail
        ? `<a href="mailto:${job.contactInfo.primaryEmail}" class="contact-btn" title="Click to email recruiter">✉️ ${escapeHtml(job.contactInfo.primaryEmail)}</a>`
        : '';
      const gmailTag = job.contactInfo.isGmail ? '<span class="gmail-tag">Gmail</span>' : '';

      contactHtml = `
        <div class="contact-box">
          <span class="contact-info-text">
            <span>📞 Recruiter Contact:</span>
            ${gmailTag}
          </span>
          <div class="contact-actions">
            ${phoneBtn}
            ${emailBtn}
          </div>
        </div>
      `;
    }

    return `
      <div class="job-card-item">
        <div class="job-card-header">
          <a href="${escapeHtml(job.url || '#')}" target="_blank" class="job-card-title">${escapeHtml(job.title || 'Untitled Role')}</a>
          <button class="btn-del-job text-btn" data-type="${type}" data-idx="${idx}" title="Delete listing">🗑️</button>
        </div>
        <div class="job-card-company">${escapeHtml(job.company || 'Company')}</div>
        <div class="job-card-meta">
          <span>📍 ${escapeHtml(job.location || 'India')}</span>
          ${job.salary ? `<span>💰 ${escapeHtml(job.salary)}</span>` : ''}
          <span>🕒 ${escapeHtml(job.savedAt || job.appliedAt || '')}</span>
          ${reasonBadge}
        </div>
        ${contactHtml}
      </div>
    `;
  }

  // Export CSV
  btnExportSaved.addEventListener('click', async () => {
    const data = await chrome.storage.local.get(['savedJobs']);
    exportJobsToCSV(data.savedJobs || [], 'naukri_saved_jobs.csv');
  });

  btnExportApplied.addEventListener('click', async () => {
    const data = await chrome.storage.local.get(['appliedJobs']);
    exportJobsToCSV(data.appliedJobs || [], 'naukri_applied_jobs.csv');
  });

  btnClearSaved.addEventListener('click', async () => {
    if (confirm('Clear all saved jobs?')) {
      await chrome.storage.local.set({ savedJobs: [] });
      renderJobs();
    }
  });

  btnClearApplied.addEventListener('click', async () => {
    if (confirm('Clear all applied jobs records?')) {
      await chrome.storage.local.set({ appliedJobs: [] });
      renderJobs();
    }
  });

  function exportJobsToCSV(jobs, filename) {
    if (!jobs || jobs.length === 0) {
      alert('No jobs to export.');
      return;
    }

    const headers = ['Title', 'Company', 'Location', 'Salary', 'Date', 'URL', 'Reason', 'Recruiter Phone', 'Recruiter Email'];
    const rows = jobs.map(j => [
      `"${(j.title || '').replace(/"/g, '""')}"`,
      `"${(j.company || '').replace(/"/g, '""')}"`,
      `"${(j.location || '').replace(/"/g, '""')}"`,
      `"${(j.salary || '').replace(/"/g, '""')}"`,
      `"${(j.appliedAt || j.savedAt || '').replace(/"/g, '""')}"`,
      `"${(j.url || '').replace(/"/g, '""')}"`,
      `"${(j.reason || '').replace(/"/g, '""')}"`,
      `"${(j.contactInfo?.primaryPhone ? '+91 ' + j.contactInfo.primaryPhone : '').replace(/"/g, '""')}"`,
      `"${(j.contactInfo?.primaryEmail || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ===========================================================================
  // ANALYTICS & SCROLLABLE DROPOFF BREAKDOWN
  // ===========================================================================
  const DROPOFF_CATEGORIES = [
    { key: 'experience', label: '🎓 Experience Exceeded', class: 'fill-exp' },
    { key: 'salary', label: '💰 Salary Floor Unmet', class: 'fill-salary' },
    { key: 'blacklist', label: '🚫 Blacklist Keyword', class: 'fill-blacklist' },
    { key: 'location', label: '📍 Outside Target City', class: 'fill-loc' },
    { key: 'company', label: '🏢 Blocked Company', class: 'fill-company' },
    { key: 'ai_spam', label: '🛡️ AI Gig / Annotation Spam', class: 'fill-spam' },
    { key: 'title_relevance', label: '🎯 Title Relevance Filter', class: 'fill-relevance' },
    { key: 'freshness', label: '📅 Stale / Post Age Exceeded', class: 'fill-other' },
    { key: 'already_applied', label: '📋 Already Applied', class: 'fill-other' },
    { key: 'easy_apply', label: '⚡ External Site', class: 'fill-easy' },
    { key: 'unrecognized', label: '❓ Unrecognized / Expired', class: 'fill-other' }
  ];

  periodBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      periodBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentLogsPeriod = btn.dataset.period;
      renderAnalytics(currentLogsPeriod);
    });
  });

  async function renderAnalytics(period = 'daily') {
    const data = await chrome.storage.local.get(['autoApplySession', 'analyticsHistory']);
    const history = data.analyticsHistory || {};
    const session = data.autoApplySession || {};

    let totalScanned = 0;
    let totalApplied = 0;
    let totalSaved = 0;
    let totalSkipped = 0;
    let totalSessions = 0;
    let skipReasons = {};

    const today = new Date();
    const isMatchDate = (dateKey) => {
      if (period === 'all') return true;
      const targetDate = new Date(dateKey);
      if (isNaN(targetDate.getTime())) return false;

      const diffDays = Math.floor((today - targetDate) / (1000 * 60 * 60 * 24));
      if (period === 'daily') return diffDays === 0;
      if (period === 'weekly') return diffDays <= 7;
      if (period === 'monthly') return diffDays <= 30;
      return true;
    };

    Object.keys(history).forEach(dateKey => {
      if (isMatchDate(dateKey)) {
        const rec = history[dateKey];
        totalScanned += rec.scanned || 0;
        totalApplied += rec.applied || 0;
        totalSaved += rec.saved || 0;
        totalSkipped += rec.skipped || 0;
        totalSessions += rec.sessions || 1;

        if (rec.skipReasons) {
          Object.keys(rec.skipReasons).forEach(k => {
            skipReasons[k] = (skipReasons[k] || 0) + rec.skipReasons[k];
          });
        }
      }
    });

    // If today is empty, fall back to current session
    if (totalScanned === 0 && session.stats) {
      totalScanned = session.stats.scanned || 0;
      totalApplied = session.stats.applied || 0;
      totalSaved = session.stats.saved || 0;
      totalSkipped = session.stats.skipped || 0;
      totalSessions = 1;
      skipReasons = session.skipReasons || {};
    }

    // Strict accounting check
    totalScanned = totalApplied + totalSaved + totalSkipped;

    logsPeriodLabel.textContent = period === 'daily' ? "Today's Summary" :
                                 period === 'weekly' ? 'Last 7 Days' :
                                 period === 'monthly' ? 'Last 30 Days' : 'All-Time Totals';
    logsSessionsCount.textContent = `${totalSessions} Session${totalSessions === 1 ? '' : 's'}`;

    logsMetricScanned.textContent = totalScanned;
    logsMetricApplied.textContent = totalApplied;
    logsMetricSaved.textContent = totalSaved;
    logsMetricSkipped.textContent = totalSkipped;

    const convPct = totalScanned > 0 ? Math.round((totalApplied / totalScanned) * 100) : 0;
    logsProgressText.textContent = `${convPct}%`;
    logsProgressBarFill.style.width = `${convPct}%`;

    // Render Dropoff Bars
    if (totalSkipped === 0) {
      logsBreakdownContainer.innerHTML = '<div class="empty-state" style="padding: 12px 0;">No jobs skipped yet in this timeframe.</div>';
    } else {
      logsBreakdownContainer.innerHTML = DROPOFF_CATEGORIES.map(cat => {
        const count = skipReasons[cat.key] || 0;
        if (count === 0) return '';
        const pct = Math.round((count / totalSkipped) * 100);
        return `
          <div class="dropoff-item">
            <div class="dropoff-row-header">
              <span>${cat.label}</span>
              <span>${count} (${pct}%)</span>
            </div>
            <div class="dropoff-bar-bg">
              <div class="dropoff-bar-fill ${cat.class}" style="width: ${pct}%;"></div>
            </div>
          </div>
        `;
      }).filter(Boolean).join('');
    }
  }

  btnExportLogs.addEventListener('click', async () => {
    const data = await chrome.storage.local.get(['analyticsHistory']);
    const history = data.analyticsHistory || {};
    const rows = Object.values(history).map(h => [
      h.date, h.scanned, h.applied, h.saved, h.skipped, h.sessions || 1
    ]);
    const headers = ['Date', 'Scanned', 'Applied', 'Saved', 'Skipped', 'Sessions'];
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'naukri_analytics.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  btnClearHistory.addEventListener('click', async () => {
    if (confirm('Clear all historical analytics?')) {
      chrome.runtime.sendMessage({ action: 'CLEAR_ANALYTICS_HISTORY' }, () => {
        renderAnalytics(currentLogsPeriod);
      });
    }
  });

  // ===========================================================================
  // REAL-TIME RUNTIME MESSAGE LISTENER
  // ===========================================================================
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'STATS_UPDATED') {
      const stats = request.stats;
      metricScanned.textContent = stats.scanned || 0;
      metricApplied.textContent = stats.applied || 0;
      metricSaved.textContent = stats.saved || 0;
      metricSkipped.textContent = stats.skipped || 0;

      const maxJobs = parseInt(ruleMaxJobs.value, 10) || 25;
      progressText.textContent = `${stats.applied || 0} / ${maxJobs} Jobs`;
      const pct = Math.min(100, Math.round(((stats.applied || 0) / maxJobs) * 100));
      progressBarFill.style.width = `${pct}%`;

      renderJobs();
    }

    if (request.action === 'NEW_LOG') {
      appendSingleLog(request.log);
    }

    if (request.action === 'SESSION_STOPPED' || request.action === 'SESSION_COMPLETED') {
      sessionBadge.textContent = request.action === 'SESSION_COMPLETED' ? 'Completed' : 'Ready';
      sessionBadge.className = 'status-badge status-idle';
      btnStart.disabled = false;
      btnStop.disabled = true;
      btnResume.style.display = 'none';
    }

    if (request.action === 'NOTIFY_CAPTCHA') {
      sessionBadge.textContent = 'Verification';
      sessionBadge.className = 'status-badge status-paused';
      btnResume.style.display = 'inline-flex';
    }

    if (request.action === 'ANALYTICS_UPDATED') {
      renderAnalytics(currentLogsPeriod);
    }
  });

  // Theme Toggle
  themeToggleBtn.addEventListener('click', () => {
    const isLight = document.body.getAttribute('data-theme') === 'light';
    if (isLight) {
      document.body.removeAttribute('data-theme');
      themeToggleBtn.textContent = '🌙';
      chrome.storage.local.set({ theme: 'dark' });
    } else {
      document.body.setAttribute('data-theme', 'light');
      themeToggleBtn.textContent = '☀️';
      chrome.storage.local.set({ theme: 'light' });
    }
  });

  await loadInitialData();
});
