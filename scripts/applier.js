/**
 * Naukri Automated Job Application - Core Crawl & Apply Engine
 * Scans Naukri job tuples, parses experience & salary, extracts recruiter contacts (Phone/Gmail),
 * auto-applies to Direct Apply postings, saves company site listings, handles pagination & multi-role queues.
 */

(function () {
  // CRITICAL GUARD: Only run in the top window
  if (window !== window.top) {
    console.log('[Naukri Auto-Applier] Child frame detected; skipping top-level crawler.');
    return;
  }

  let isRunning = false;
  let isHalted = false;
  let processedJobIds = new Set();

  // Load and persist processed job IDs
  async function loadProcessedJobIds() {
    try {
      const data = await chrome.storage.local.get(['autoApplySession']);
      const list = data?.autoApplySession?.processedJobIds || [];
      processedJobIds.clear();
      list.forEach(id => processedJobIds.add(String(id)));
    } catch (_) {}
  }

  async function persistProcessedJobId(jobId) {
    if (!jobId) return;
    const cleanId = String(jobId);
    processedJobIds.add(cleanId);
    try {
      const data = await chrome.storage.local.get(['autoApplySession']);
      if (data?.autoApplySession) {
        if (!data.autoApplySession.processedJobIds) data.autoApplySession.processedJobIds = [];
        if (!data.autoApplySession.processedJobIds.includes(cleanId)) {
          data.autoApplySession.processedJobIds.push(cleanId);
          await chrome.storage.local.set({ autoApplySession: data.autoApplySession });
        }
      }
    } catch (_) {}
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function humanDelay(baseMs = 1200) {
    const jitter = Math.floor(Math.random() * 400) - 150;
    return sleep(Math.max(800, baseMs + jitter));
  }

  // Synthesize pleasant two-tone chime via Web Audio API (offline, zero assets)
  function playAudioChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (_) {}
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Unified floating in-page status pill (Anchored to bottom-left to NEVER obstruct right-side drawer/chatbot)
  function updateFloatingPill(text, options = {}) {
    const isDone = typeof options === 'boolean' ? options : Boolean(options.isDone);
    const status = options.status || (isDone ? 'success' : 'running');
    const actionButton = options.actionButton || null;
    const showStop = options.showStop !== false && !isDone;

    // Clean up any legacy or duplicate buttons
    const oldBtn = document.getElementById('naukri-standalone-auto-apply-btn');
    if (oldBtn) oldBtn.remove();

    let pill = document.getElementById('naukri-auto-applier-pill');
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'naukri-auto-applier-pill';
      pill.style.cssText = 'position: fixed; bottom: 24px; left: 24px; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; pointer-events: auto;';
      document.body.appendChild(pill);
    } else {
      pill.style.left = '24px';
      pill.style.right = 'auto';
    }

    const dotColors = {
      running: '#10b981',
      success: '#10b981',
      warning: '#f59e0b',
      mismatch: '#f59e0b',
      info: '#3b82f6'
    };
    const dotColor = dotColors[status] || '#10b981';

    let actionBtnHtml = '';
    if (actionButton) {
      const bg = actionButton.bg || '#059669';
      actionBtnHtml = `<button id="naukri-pill-action-btn" style="background: ${bg}; color: white; border: none; border-radius: 14px; padding: 5px 12px; font-size: 12px; font-weight: 700; cursor: pointer; transition: background 0.2s; white-space: nowrap;">${escapeHtml(actionButton.text)}</button>`;
    }

    let resumeBtnHtml = `<button id="naukri-pill-resume-btn" style="display: none; background: #10b981; color: white; border: none; border-radius: 14px; padding: 4px 12px; font-size: 12px; font-weight: 700; cursor: pointer; transition: background 0.2s;">▶ Resume</button>`;

    let stopOrCloseHtml = '';
    if (showStop) {
      stopOrCloseHtml = `<button id="naukri-pill-stop-btn" style="background: #ef4444; color: white; border: none; border-radius: 14px; padding: 4px 12px; font-size: 12px; font-weight: 700; cursor: pointer; transition: background 0.2s;">⏹ Stop</button>`;
    } else {
      stopOrCloseHtml = `<button id="naukri-pill-close-btn" style="background: #334155; color: #94a3b8; border: none; border-radius: 14px; padding: 4px 10px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.2s;">✕</button>`;
    }

    pill.innerHTML = `
      <div style="background: #0f172a; color: #f8fafc; border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 10px 30px rgba(0,0,0,0.5); border-radius: 30px; padding: 8px 16px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 10px; backdrop-filter: blur(10px);">
        <span id="naukri-pill-dot" style="width: 9px; height: 9px; border-radius: 50%; background: ${dotColor}; box-shadow: 0 0 10px ${dotColor}; display: inline-block; flex-shrink: 0;"></span>
        <span id="naukri-pill-text" style="max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(text)}</span>
        ${actionBtnHtml}
        ${resumeBtnHtml}
        ${stopOrCloseHtml}
      </div>
    `;

    // Event handlers
    const stopBtn = pill.querySelector('#naukri-pill-stop-btn');
    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        isHalted = true;
        chrome.runtime.sendMessage({ action: 'STOP_AUTO_APPLY' }).catch(() => {});
        pill.remove();
      });
    }

    const closeBtn = pill.querySelector('#naukri-pill-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => pill.remove());
    }

    const resumeBtn = pill.querySelector('#naukri-pill-resume-btn');
    if (resumeBtn) {
      resumeBtn.addEventListener('click', () => {
        window._naukriManualResume = true;
        hideCaptchaPillNotice();
      });
    }

    const actionBtn = pill.querySelector('#naukri-pill-action-btn');
    if (actionBtn && actionButton?.onClick) {
      actionBtn.addEventListener('click', actionButton.onClick);
    }

    if (isDone) {
      setTimeout(() => {
        if (pill && pill.parentNode) pill.remove();
      }, 5000);
    }
  }

  function showCaptchaPillNotice() {
    updateFloatingPill('⚠️ CAPTCHA detected! Solve it or click Resume.', {
      status: 'warning',
      actionButton: {
        text: '▶ Resume',
        bg: '#10b981',
        onClick: () => {
          window._naukriManualResume = true;
          hideCaptchaPillNotice();
        }
      },
      showStop: true
    });
  }

  function hideCaptchaPillNotice() {
    updateFloatingPill('✅ CAPTCHA cleared! Continuing...', {
      status: 'success',
      showStop: true
    });
  }

  function removeFloatingPill() {
    const pill = document.getElementById('naukri-auto-applier-pill');
    if (pill) pill.remove();
    const oldBtn = document.getElementById('naukri-standalone-auto-apply-btn');
    if (oldBtn) oldBtn.remove();
  }

  function log(message, type = 'info') {
    console.log(`[Naukri Auto-Applier] ${message}`);
    chrome.runtime.sendMessage({ action: 'APPEND_LOG', message, logType: type }).catch(() => {});
    if (isRunning) updateFloatingPill(message.slice(0, 52));
  }

  // Extract ID from card or link
  function extractJobId(card) {
    if (!card) return null;
    let id = card.getAttribute('data-job-id') || card.getAttribute('data-jobid') || card.getAttribute('id');
    if (id) return id;

    const link = card.querySelector('a.title, a[href*="job-listings"]');
    if (link && link.href) {
      const match = link.href.match(/job-listings-.*?-(\d+)(?:\?|$)/i) || link.href.match(/-(\d{7,15})(?:\?|$)/);
      if (match && match[1]) return match[1];
      return link.href.split('?')[0];
    }
    return null;
  }

  // Synchronize clicked card with detail pane / drawer
  async function waitForJobDetails(card, maxWaitMs = 3000) {
    const start = Date.now();
    await sleep(350);

    while (Date.now() - start < maxWaitMs) {
      const drawer = window.NaukriFormFiller?.getActiveContainer();
      if (drawer) return drawer;

      const desc = document.querySelector('.jd-description, .job-desc, [class*="job-description"], .styles_job-desc-container__');
      if (desc && desc.textContent.trim().length > 30) return desc;

      await sleep(150);
    }
    return document.querySelector('.jd-description, .job-desc');
  }

  // Inspect Apply Button type (Direct Apply vs Company Site)
  function inspectApplyButton(card, detailPane) {
    const scope = detailPane || card || document;

    const allButtons = Array.from(scope.querySelectorAll('button, a[role="button"], a.apply-button, a[class*="apply"]'))
      .filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);

    // 1. Direct Apply / Easy Apply
    const directBtn = allButtons.find(b => {
      const txt = (b.textContent || b.value || '').toLowerCase().trim();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase().trim();
      return (
        txt === 'apply' ||
        txt === 'apply now' ||
        txt === 'easy apply' ||
        txt === 'quick apply' ||
        txt === 'apply on naukri' ||
        aria.includes('apply on naukri') ||
        b.id === 'apply-button' ||
        b.classList.contains('apply-button')
      );
    });

    if (directBtn) {
      return { type: 'direct_apply', element: directBtn };
    }

    // 2. Company External Site
    const companyBtn = allButtons.find(b => {
      const txt = (b.textContent || b.value || '').toLowerCase().trim();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase().trim();
      return (
        txt.includes('company site') ||
        txt.includes('employer website') ||
        txt.includes('apply on company') ||
        aria.includes('company site')
      );
    });

    if (companyBtn) {
      const url = companyBtn.href || (companyBtn.closest('a') ? companyBtn.closest('a').href : window.location.href);
      return { type: 'company_site', element: companyBtn, url };
    }

    // Also check on the job card itself
    const cardApplyBtn = card?.querySelector('.apply-button, button[id*="apply"], [class*="apply-button"]');
    if (cardApplyBtn) {
      return { type: 'direct_apply', element: cardApplyBtn };
    }

    return { type: 'direct_apply', element: null };
  }

  // Autonomous Form Wizard Runner
  async function executeApplicationWizard(profile, settings, isStandalone = false) {
    log('Waiting for Naukri application drawer to open...', 'info');

    // Wait up to 4.5 seconds for drawer, chatbot, or immediate confirmation to appear
    let container = null;
    const startWait = Date.now();
    while (Date.now() - startWait < 4500) {
      if (isHalted) return { success: false, reason: 'halted' };
      if (window.NaukriFormFiller?.isApplicationSubmitted()) {
        log('🎉 Confirmation detected: Application submitted successfully!', 'success');
        playAudioChime();
        return { success: true };
      }
      container = window.NaukriFormFiller?.getActiveContainer();
      if (container) break;
      await sleep(250);
    }

    if (!container || container === document.body || container === document.documentElement) {
      if (window.NaukriFormFiller?.isApplicationSubmitted()) {
        return { success: true };
      }
      log('✍️ Application drawer not detected. Keeping page open for manual review.', 'warning');
      playAudioChime();
      return { success: false, reason: 'unresolved_fields' };
    }

    const maxSteps = 12;
    let stepCount = 0;
    let stuckAttempts = 0;

    while (stepCount < maxSteps) {
      if (isHalted) return { success: false, reason: 'halted' };
      stepCount++;

      container = window.NaukriFormFiller?.getActiveContainer() || container;
      if (!container || container === document.body) {
        log('✍️ Application drawer not detected. Keeping page open.', 'warning');
        return { success: false, reason: 'unresolved_fields' };
      }

      // Check CAPTCHA
      if (window.NaukriFormFiller?.checkCaptcha()) {
        playAudioChime();
        log('⚠️ Active CAPTCHA challenge detected! Please solve it on the page or click Resume.', 'warning');
        chrome.runtime.sendMessage({ action: 'NOTIFY_CAPTCHA' }).catch(() => {});
        showCaptchaPillNotice();

        let waitedMs = 0;
        const maxWaitMs = 60000; // 60-second safety timeout

        while (window.NaukriFormFiller?.checkCaptcha() && !isHalted && !window._naukriManualResume && waitedMs < maxWaitMs) {
          await sleep(2000);
          waitedMs += 2000;
          if (waitedMs % 10000 === 0) {
            log(`⏳ Waiting for CAPTCHA verification (${Math.round((maxWaitMs - waitedMs) / 1000)}s remaining)...`, 'info');
          }
        }

        window._naukriManualResume = false;
        hideCaptchaPillNotice();

        if (waitedMs >= maxWaitMs && window.NaukriFormFiller?.checkCaptcha()) {
          log('⚠️ CAPTCHA timed out after 60s. Auto-saving job to Saved Jobs so crawler can proceed.', 'warning');
          if (!isStandalone) window.NaukriFormFiller?.closeModal(container);
          return { success: false, reason: 'captcha_timeout' };
        } else {
          log('✅ CAPTCHA cleared! Continuing application wizard...', 'success');
        }
      }

      // Check success confirmation
      if (window.NaukriFormFiller?.isApplicationSubmitted(container)) {
        log('🎉 Confirmation detected: Application submitted successfully!', 'success');
        playAudioChime();
        await sleep(1200);
        if (!isStandalone) window.NaukriFormFiller?.closeModal(container);
        return { success: true };
      }

      // Fill current step fields (pass container)
      const fillRes = window.NaukriFormFiller?.fillCurrentStep(profile, container);
      if (fillRes?.filled > 0) {
        log(`Step ${stepCount}: Auto-filled ${fillRes.filled} question(s).`, 'success');
        stuckAttempts = 0;
      }
      await humanDelay(settings?.stepDelayMs || 800);

      // Check if mandatory questions remain unanswered before advancing/submitting
      if (window.NaukriFormFiller?.hasUnansweredQuestions && window.NaukriFormFiller.hasUnansweredQuestions(container)) {
        log('✍️ Screening questions require your input. Keeping drawer open for you to answer.', 'warning');
        playAudioChime();
        // NEVER call closeModal! Leave the drawer open for user to answer and submit!
        return { success: false, reason: 'unresolved_fields' };
      }

      // Advance or Submit
      const advRes = await window.NaukriFormFiller?.advanceOrSubmit(container);

      if (advRes?.action === 'unresolved' || advRes?.action === 'none') {
        log('✍️ Screening questions require your input. Keeping drawer open for you to answer.', 'warning');
        playAudioChime();
        // NEVER call closeModal! Leave the drawer open for user to answer and submit!
        return { success: false, reason: 'unresolved_fields' };
      }

      if (advRes?.action === 'submitted') {
        log('⚡ Clicked Submit Application button!', 'info');
        // Poll for submission confirmation for up to 4 seconds
        const pollStart = Date.now();
        while (Date.now() - pollStart < 4000) {
          await sleep(500);
          if (window.NaukriFormFiller?.isApplicationSubmitted(container)) {
            log('🎉 Confirmation detected: Application submitted successfully!', 'success');
            playAudioChime();
            if (!isStandalone) window.NaukriFormFiller?.closeModal(container);
            return { success: true };
          }
        }
        stuckAttempts = 0;
      } else if (advRes?.action === 'advanced') {
        log('Advanced to next step...', 'info');
        await sleep(1500);
        stuckAttempts = 0;
      } else {
        if (fillRes?.filled > 0) {
          log('Question answered. Waiting for next step or submit button...', 'info');
          stuckAttempts = 0;
          await sleep(1500);
        } else {
          stuckAttempts++;
          if (stuckAttempts >= 4) {
            log('✍️ Wizard could not resolve all required fields automatically. Keeping drawer open.', 'warning');
            playAudioChime();
            // NEVER call closeModal! Leave the drawer open for user to answer and submit!
            return { success: false, reason: 'unresolved_fields' };
          }
          await sleep(1500);
        }
      }
    }

    if (window.NaukriFormFiller?.isApplicationSubmitted()) {
      if (!isStandalone) window.NaukriFormFiller?.closeModal();
      return { success: true };
    }

    // Do NOT closeModal on failure! Keep drawer open!
    return { success: false, reason: 'unresolved_fields' };
  }

  // Process a single job card tuple
  async function processJobTuple(card, profile, settings) {
    if (isHalted) return 'halted';

    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const originalBorder = card.style.border;
    card.style.border = '2px solid #059669';
    card.style.borderRadius = '8px';

    const jobId = extractJobId(card);
    if (jobId && processedJobIds.has(String(jobId))) {
      card.style.border = originalBorder;
      return 'already_processed';
    }
    if (jobId) await persistProcessedJobId(jobId);

    // Extract Card Attributes
    const titleEl = card.querySelector('a.title, [class*="title"], h2.title');
    const title = (titleEl?.textContent || '').trim();

    const compEl = card.querySelector('a.comp-name, .subTitle, [class*="comp-name"], .companyInfo a');
    const company = (compEl?.textContent || '').trim();

    const expEl = card.querySelector('.exp-wrap span.exp, li.experience span, .expwdth, span[class*="exp"], span.ni-job-tuple-icon-experience');
    const expText = (expEl?.textContent || '').trim();

    const salEl = card.querySelector('.sal-wrap span.sal, li.salary span, .salwdth, span[class*="sal"], span.ni-job-tuple-icon-salary');
    const salaryText = (salEl?.textContent || '').trim();

    const locEl = card.querySelector('.loc-wrap span.loc, li.location span, .locwdth, span[class*="loc"], span.ni-job-tuple-icon-location');
    const location = (locEl?.textContent || '').trim();

    const descEl = card.querySelector('.job-desc, div[class*="job-desc"], ul.tags-gt');
    const cardDesc = (descEl?.textContent || '').trim();

    const jobUrl = titleEl?.href || window.location.href;

    log(`🔍 Inspecting: "${title}" at "${company}" (${location})`, 'info');

    // =========================================================================
    // RECRUITER CONTACT EXTRACTION (PHONE / GMAIL / CORPORATE EMAIL)
    // =========================================================================
    const fullSnippet = `${title} \n ${company} \n ${cardDesc} \n ${card.innerText || ''}`;
    const contactInfo = window.NaukriMatcher?.extractRecruiterContact(fullSnippet) || { hasContact: false };

    if (contactInfo.hasContact) {
      log(`📞 Direct Recruiter Contact Detected: ${contactInfo.summary}`, 'success');
      playAudioChime();
    }

    // =========================================================================
    // MULTI-TIER FILTER EVALUATION
    // =========================================================================

    // 1. AI Gig & Micro-Task Spam Shield
    if (settings.blockAiSpam !== false && window.NaukriMatcher) {
      const spamCheck = window.NaukriMatcher.isAiGigSpam(title, company, cardDesc);
      if (spamCheck.isSpam) {
        log(`⏭️ Skipped AI/Gig Spam: "${title}" (${spamCheck.reason})`, 'warning');
        if (contactInfo.hasContact && settings.saveContactJobs !== false) {
          chrome.runtime.sendMessage({
            action: 'SAVE_JOB',
            job: { id: jobId, title, company, location, salary: salaryText, url: jobUrl, reason: `📞 Direct Contact (${contactInfo.summary}) [AI Tagged]`, contactInfo }
          });
        } else {
          chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'ai_spam' } });
        }
        card.style.border = originalBorder;
        return 'skipped';
      }
    }

    // 2. Title Relevance Filter
    if (settings.matchTitleRelevance !== false && window.NaukriMatcher) {
      const isRelevant = window.NaukriMatcher.checkTitleRelevance(title, settings.targetJobQuery);
      if (!isRelevant) {
        log(`⏭️ Skipped (Title Irrelevant): "${title}" for target "${settings.targetJobQuery}"`, 'warning');
        if (contactInfo.hasContact && settings.saveContactJobs !== false) {
          chrome.runtime.sendMessage({
            action: 'SAVE_JOB',
            job: { id: jobId, title, company, location, salary: salaryText, url: jobUrl, reason: `📞 Direct Contact (${contactInfo.summary}) [Irrelevant Title]`, contactInfo }
          });
        } else {
          chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'title_relevance' } });
        }
        card.style.border = originalBorder;
        return 'skipped';
      }
    }

    // 3. Blocked Company List
    if (settings.blockedCompanies && window.NaukriMatcher) {
      if (window.NaukriMatcher.isCompanyBlocked(company, settings.blockedCompanies)) {
        log(`⏭️ Skipped (Blocked Company): "${company}"`, 'warning');
        chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'company' } });
        card.style.border = originalBorder;
        return 'skipped';
      }
    }

    // 4. Strict Location Matching
    if (settings.strictLocation && window.NaukriMatcher) {
      const isLocMatch = window.NaukriMatcher.checkLocationMatch(location, settings.targetLocation);
      if (!isLocMatch) {
        log(`⏭️ Skipped (Outside Target City): "${location}" vs "${settings.targetLocation}"`, 'warning');
        if (contactInfo.hasContact && settings.saveContactJobs !== false) {
          chrome.runtime.sendMessage({
            action: 'SAVE_JOB',
            job: { id: jobId, title, company, location, salary: salaryText, url: jobUrl, reason: `📞 Direct Contact (${contactInfo.summary}) [Outside City]`, contactInfo }
          });
        } else {
          chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'location' } });
        }
        card.style.border = originalBorder;
        return 'skipped';
      }
    }

    // 5. Negative Keywords Blacklist
    if (settings.blacklistKeywords && window.NaukriMatcher) {
      if (window.NaukriMatcher.isBlacklisted(fullSnippet, settings.blacklistKeywords)) {
        log(`⏭️ Skipped (Blacklisted Keyword in job text): "${title}"`, 'warning');
        chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'blacklist' } });
        card.style.border = originalBorder;
        return 'skipped';
      }
    }

    // 6. Experience Matching
    if (window.NaukriMatcher) {
      const parsedExp = window.NaukriMatcher.parseExperienceRequirement(title, cardDesc, expText);
      if (parsedExp !== null && settings.userYearsExp !== undefined) {
        if (parsedExp > Number(settings.userYearsExp)) {
          log(`⏭️ Skipped (Requires ${parsedExp}+ years exp): "${title}"`, 'warning');
          if (contactInfo.hasContact && settings.saveContactJobs !== false) {
            chrome.runtime.sendMessage({
              action: 'SAVE_JOB',
              job: { id: jobId, title, company, location, salary: salaryText, url: jobUrl, reason: `📞 Direct Contact (${contactInfo.summary}) [Higher Exp: ${parsedExp}Y]`, contactInfo }
            });
          } else {
            chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'experience' } });
          }
          card.style.border = originalBorder;
          return 'skipped';
        }
      } else if (parsedExp === null && settings.unlistedExpAction === 'skip') {
        log(`⏭️ Skipped (Unlisted experience requirement): "${title}"`, 'warning');
        chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'experience' } });
        card.style.border = originalBorder;
        return 'skipped';
      }
    }

    // 7. Salary Floor Matching
    if (settings.minMonthlySalary && window.NaukriMatcher) {
      const salParsed = window.NaukriMatcher.parseMonthlySalary(salaryText);
      if (salParsed && salParsed.maxMonthly && salParsed.maxMonthly < Number(settings.minMonthlySalary)) {
        log(`⏭️ Skipped (Salary below ₹${settings.minMonthlySalary}/mo): "${salaryText}"`, 'warning');
        if (contactInfo.hasContact && settings.saveContactJobs !== false) {
          chrome.runtime.sendMessage({
            action: 'SAVE_JOB',
            job: { id: jobId, title, company, location, salary: salaryText, url: jobUrl, reason: `📞 Direct Contact (${contactInfo.summary}) [Below Salary Floor]`, contactInfo }
          });
        } else {
          chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'salary' } });
        }
        card.style.border = originalBorder;
        return 'skipped';
      }
    }

    // 8. Job Freshness / Posting Age Filter (Guards against stale sponsored/promoted listings)
    if (settings.jobFreshness && settings.jobFreshness !== 'all' && window.NaukriMatcher?.parseJobAgeDays) {
      const postAgeDays = window.NaukriMatcher.parseJobAgeDays(fullSnippet);
      const maxAgeDays = Number(settings.jobFreshness);
      if (postAgeDays !== null && !isNaN(maxAgeDays) && postAgeDays > maxAgeDays) {
        log(`⏭️ Skipped (Stale Post: ~${postAgeDays}d old > max ${maxAgeDays}d): "${title}"`, 'warning');
        if (contactInfo.hasContact && settings.saveContactJobs !== false) {
          chrome.runtime.sendMessage({
            action: 'SAVE_JOB',
            job: { id: jobId, title, company, location, salary: salaryText, url: jobUrl, reason: `📞 Direct Contact (${contactInfo.summary}) [Stale Post: ${postAgeDays}D]`, contactInfo }
          });
        } else {
          chrome.runtime.sendMessage({ action: 'UPDATE_STATS', delta: { skipped: 1, reason: 'freshness' } });
        }
        card.style.border = originalBorder;
        return 'skipped';
      }
    }

    // =========================================================================
    // APPLY BUTTON INSPECTION (DIRECT APPLY VS COMPANY EXTERNAL SITE)
    // =========================================================================
    const applyInfo = inspectApplyButton(card);

    if (applyInfo.type === 'company_site') {
      log(`📋 External Company Site Listing -> Saving to Saved Jobs.`, 'info');
      const reasonText = contactInfo.hasContact
        ? `External Site + 📞 Direct Contact: ${contactInfo.summary}`
        : 'External Company Site';

      chrome.runtime.sendMessage({
        action: 'SAVE_JOB',
        job: { id: jobId, title, company, location, salary: salaryText, url: applyInfo.url || jobUrl, reason: reasonText, contactInfo }
      });
      card.style.border = originalBorder;
      return 'saved';
    }

    // Direct Apply on Naukri
    if (applyInfo.type === 'direct_apply') {
      if (applyInfo.element) {
        // Inline Apply button present directly on the card
        log(`⚡ Triggering Inline Apply on Naukri...`, 'info');
        window.NaukriFormFiller?.triggerHumanClick(applyInfo.element);

        const wizardResult = await executeApplicationWizard(profile, settings);

        if (wizardResult.success) {
          log(`🎉 Successfully applied to "${title}" at "${company}"!`, 'success');
          chrome.runtime.sendMessage({
            action: 'JOB_APPLIED',
            job: { id: jobId, title, company, location, salary: salaryText, url: jobUrl, contactInfo }
          });
          card.style.border = '2px solid #10b981';
          return 'applied';
        } else {
          // OPPORTUNITY PROTECTION: Auto-save incomplete applications so candidate never loses opportunity
          const failReason = wizardResult.reason === 'unresolved_fields' ? 'Unresolved Screening Questions' :
                             wizardResult.reason === 'max_steps_exceeded' ? 'Multi-Step Limit' :
                             (wizardResult.reason || 'Manual Review Required');

          log(`⚠️ Could not auto-complete "${title}" (${failReason}).`, 'warning');
          log(`📋 Auto-saving to "Saved Jobs" for manual completion so opportunity is not lost!`, 'info');

          const saveReason = contactInfo.hasContact
            ? `⚠️ Incomplete: ${failReason} + 📞 Direct Contact: ${contactInfo.summary}`
            : `⚠️ Incomplete: ${failReason}`;

          chrome.runtime.sendMessage({
            action: 'SAVE_JOB',
            job: { id: jobId, title, company, location, salary: salaryText, url: jobUrl, reason: saveReason, contactInfo }
          });
          card.style.border = originalBorder;
          return 'saved';
        }
      } else {
        // Card tuple requires opening the full job details page to click the blue Apply button
        log(`⚡ Card requires full details page apply -> Opening detail tab to click Apply...`, 'info');

        const detailResult = await new Promise((resolve) => {
          chrome.runtime.sendMessage({
            action: 'APPLY_JOB_IN_TAB',
            job: { id: jobId, title, company, location, salary: salaryText, url: jobUrl, contactInfo },
            settings
          }, (response) => {
            resolve(response || { status: 'saved', reason: 'no_response' });
          });
        });

        if (detailResult.status === 'applied') {
          log(`🎉 Successfully applied to "${title}" at "${company}" via detail page!`, 'success');
          card.style.border = '2px solid #10b981';
          return 'applied';
        } else if (detailResult.status === 'skipped') {
          log(`ℹ️ Listing skipped: "${title}" (${detailResult.reason || 'Already Applied'})`, 'info');
          card.style.border = originalBorder;
          return 'skipped';
        } else {
          log(`📋 Listing saved: "${title}" (${detailResult.reason || 'Manual Review'})`, 'info');
          card.style.border = originalBorder;
          return 'saved';
        }
      }
    }

    card.style.border = originalBorder;
    return 'skipped';
  }

  // ===========================================================================
  // IN-PAGE FILTER SYNCHRONIZATION (DOM-LEVEL RESILIENCE)
  // ===========================================================================
  async function syncPageFilters(settings) {
    if (!settings) return;

    // 1. Freshness Filter Sync (e.g., '1', '3', '7', '15', '30')
    if (settings.jobFreshness && settings.jobFreshness !== 'all') {
      try {
        const freshnessBtn = document.getElementById('filter-freshness');
        if (freshnessBtn) {
          const btnText = (freshnessBtn.textContent || '').trim().toLowerCase();
          const targetDays = String(settings.jobFreshness).trim();
          const expectedLabel = targetDays === '1' ? '1 day' : `${targetDays} days`;

          if (!btnText.includes(expectedLabel)) {
            log(`🔄 Synchronizing Freshness filter in UI to Last ${targetDays} day(s)...`, 'info');
            freshnessBtn.click();
            await sleep(250);

            const opt = document.querySelector(`a[data-id="filter-freshness-${targetDays}"]`);
            if (opt) {
              opt.click();
              await sleep(2500); // Allow React to re-fetch and render filtered listings
              log(`✅ Freshness filter applied in UI: Last ${targetDays} day(s).`, 'success');
            } else {
              freshnessBtn.click(); // Close dropdown if option not matched
            }
          }
        }
      } catch (err) {
        console.warn('[Applier] Freshness sync error:', err);
      }
    }
  }

  // ===========================================================================
  // MAIN CRAWLER LOOP
  // ===========================================================================
  async function runCrawlSession() {
    if (isRunning) return;
    isRunning = true;
    isHalted = false;

    await loadProcessedJobIds();

    const data = await chrome.storage.local.get(['autoApplySession', 'userProfile']);
    const session = data.autoApplySession;
    const profile = data.userProfile;

    if (!session || !session.isRunning) {
      isRunning = false;
      return;
    }

    const settings = session.settings || {};
    const maxJobs = settings.maxJobsPerSession || 25;

    // Proactively synchronize in-page UI filters with session settings
    await syncPageFilters(settings);

    log(`🚀 Naukri Auto-Apply Crawler active on page! Target: up to ${maxJobs} jobs.`, 'info');

    // Wait up to 8s for React SPA to mount job cards in the DOM
    async function waitForJobCards(maxWaitMs = 8000) {
      const cardSelectors = [
        '.srp-jobtuple-wrapper',
        'article.jobTuple',
        'div.cust-job-tuple',
        'div.tuple',
        'div[data-job-id]',
        'div.list > article'
      ];

      const start = Date.now();
      while (Date.now() - start < maxWaitMs) {
        if (isHalted) return [];

        for (const sel of cardSelectors) {
          const found = Array.from(document.querySelectorAll(sel));
          if (found.length > 0) return found;
        }

        const bodyText = (document.body?.innerText || '').toLowerCase();
        if (bodyText.includes('no jobs found') || bodyText.includes('0 job vacancies') || bodyText.includes('no results found')) {
          return [];
        }

        await sleep(350);
      }

      return [];
    }

    const cards = await waitForJobCards(8000);
    log(`Found ${cards.length} job cards on current search page.`, 'info');

    if (cards.length === 0) {
      log('ℹ️ No job cards found on this page. Concluding query without jumping pages.', 'info');
      chrome.runtime.sendMessage({ action: 'QUERY_RESULTS_FINISHED' }).catch(() => {});
      updateFloatingPill('Queue query completed.', true);
      isRunning = false;
      return;
    }

    let pageScannedCount = 0;

    for (let i = 0; i < cards.length; i++) {
      if (isHalted) break;

      // Check overall session cap
      const curData = await chrome.storage.local.get(['autoApplySession']);
      const totalApplied = curData.autoApplySession?.stats?.applied || 0;
      if (totalApplied >= maxJobs) {
        log(`🎯 Target reached: Applied to ${totalApplied} jobs! Stopping session.`, 'success');
        playAudioChime();
        chrome.runtime.sendMessage({ action: 'STOP_AUTO_APPLY' }).catch(() => {});
        updateFloatingPill(`Done! Applied to ${totalApplied} jobs.`, true);
        isRunning = false;
        return;
      }

      const card = cards[i];
      const result = await processJobTuple(card, profile, settings);

      if (result !== 'already_processed') {
        pageScannedCount++;
        await humanDelay(settings.stepDelayMs || 1200);
      }
    }

    if (isHalted) {
      isRunning = false;
      return;
    }

    // Pagination: look for Next Page button
    log('Finished evaluating cards on current page. Checking for Next Page...', 'info');
    await sleep(1500);

    function isValidNextButton(el) {
      if (!el) return false;
      if (el.hasAttribute('disabled')) return false;
      if (el.getAttribute('aria-disabled') === 'true') return false;
      if (el.classList.contains('disabled')) return false;

      const txt = (el.textContent || '').toLowerCase().trim();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase().trim();
      const href = el.getAttribute('href') || el.href || '';

      // Strictly reject Previous buttons
      if (txt.includes('previous') || aria.includes('previous') || el.className.includes('previous')) {
        return false;
      }

      // Check for Next indicator
      const isNext = txt === 'next' || txt.includes('next page') || aria === 'next' || aria.includes('next');
      if (!isNext) return false;

      // Reject invalid or undefined destinations
      if (href.includes('undefined')) return false;

      return true;
    }

    const candidateLinks = Array.from(document.querySelectorAll(
      '.pagination a, [class*="pagination"] a, a[class*="styles_btn-secondary"], a.styles_btn-secondary__2AsIP, a.fright, a[aria-label="Next"], a.pagination-next, button'
    ));
    const nextBtn = candidateLinks.find(isValidNextButton);

    if (nextBtn) {
      log('Navigating to Next Page...', 'info');
      window.NaukriFormFiller?.triggerHumanClick(nextBtn);
      // Wait for page transition / reload
      await sleep(3500);
      isRunning = false;
      runCrawlSession();
    } else {
      log('No more pages for current search query. Notifying queue worker...', 'info');
      chrome.runtime.sendMessage({ action: 'QUERY_RESULTS_FINISHED' }).catch(() => {});
      updateFloatingPill('Queue query completed.', true);
      isRunning = false;
    }
  }

  // ===========================================================================
  // LISTENERS
  // ===========================================================================
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'HALT_ENGINE') {
      isHalted = true;
      isRunning = false;
      removeFloatingPill();
      sendResponse({ status: 'halted' });
      return true;
    }

    if (request.action === 'SESSION_COMPLETED') {
      isHalted = true;
      isRunning = false;
      playAudioChime();
      updateFloatingPill('🎉 Auto-Apply Session Finished!', true);
      sendResponse({ status: 'done' });
      return true;
    }

    if (request.action === 'RESUME_AUTO_APPLY') {
      window._naukriManualResume = true;
      hideCaptchaPillNotice();
      sendResponse({ status: 'resumed' });
      return true;
    }

    if (request.action === 'PLAY_ALERT_CHIME') {
      playAudioChime();
      sendResponse({ status: 'chime_played' });
      return true;
    }

    if (request.action === 'EXECUTE_DETAIL_APPLY') {
      handleAutoApplyOnDetailPage();
      sendResponse({ status: 'started' });
      return true;
    }
  });

  // Autonomous Detail Page Apply Runner (clicks blue #apply-button, fills drawer, submits, notifies background)
  let detailApplyTriggered = false;

  async function handleAutoApplyOnDetailPage(isManual = false) {
    if (detailApplyTriggered && !isManual) return;
    detailApplyTriggered = true;
    isRunning = true;

    function setBtnUi(text, bg = '#10b981', disabled = true) {
      let status = 'running';
      let isDone = !disabled;
      if (bg.includes('ef4444') || bg.includes('f59e0b')) {
        status = 'warning';
      } else if (bg.includes('3b82f6') || bg.includes('64748b')) {
        status = 'info';
      } else if (bg.includes('059669')) {
        status = 'success';
        isDone = true;
      }
      updateFloatingPill(text, { isDone, status, showStop: !isDone });
    }

    setBtnUi('⚡ Finding Apply button...', '#10b981', true);
    log('⚡ Auto-Apply running on Job Details page...', 'info');

    await sleep(800);

    const data = await chrome.storage.local.get(['userProfile', 'autoApplySession']);
    const profile = data.userProfile || {};
    const settings = data.autoApplySession?.settings || profile.autoApplierSettings || {};

    const title = (document.querySelector('h1')?.textContent || document.title || 'Job').trim();
    const compEl = document.querySelector(
      '[class*="jd-header-comp-name"] a, [class*="hiring-for"], a.comp-name, .comp-name, [class*="company-name"], [class*="companyName"]'
    );
    let company = (compEl?.textContent || '').trim();
    if (!company || company.toLowerCase() === 'company') {
      const headerComp = document.querySelector('#job_header a[title], .styles_job-header-container___0wLZ a[title]');
      if (headerComp) company = (headerComp.getAttribute('title') || headerComp.textContent || '').trim();
    }
    if (!company) company = 'Company';
    const jobUrl = window.location.href.split('#')[0];

    // Extract recruiter contact from the full page text if available
    const pageFullText = `${title}\n${company}\n${document.body?.innerText || ''}`;
    const contactInfo = window.NaukriMatcher?.extractRecruiterContact(pageFullText) || { hasContact: false };
    if (contactInfo.hasContact) {
      log(`📞 Direct Recruiter Contact Detected on Details: ${contactInfo.summary}`, 'success');
    }

    async function finishDetail(status, reason = '', keepTabOpen = false) {
      isRunning = false;
      if (!isManual) {
        chrome.runtime.sendMessage({
          action: 'DETAIL_APPLY_FINISHED',
          status,
          reason,
          keepTabOpen: Boolean(keepTabOpen),
          job: { title, company, url: jobUrl, contactInfo }
        }).catch(() => {});
      }
    }

    // 1. Poll for the Apply button on the details page (up to 8 seconds)
    async function waitForDetailApplyButton(maxWaitMs = 8000) {
      const start = Date.now();
      while (Date.now() - start < maxWaitMs) {
        if (isHalted) return null;

        const candidates = Array.from(document.querySelectorAll(
          '#apply-button, button.apply-button, button[class*="apply-button"], [id*="apply-button"], a.apply-button, a[class*="apply-button"], .styles_jhc__apply-button-container__5Bqnb button, [class*="apply-button-container"] button, #job_header button, button, a[role="button"]'
        ));

        // 1. Try to find a visible button first
        let btn = candidates.find(el => {
          if (el.id === 'naukri-btn-instant-apply' || el.closest('#naukri-auto-applier-pill') || el.closest('#naukri-standalone-auto-apply-btn')) return false;
          if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
          const txt = (el.textContent || el.value || '').trim().toLowerCase();
          return el.id === 'apply-button' ||
                 el.classList.contains('apply-button') ||
                 txt === 'apply' || txt === 'apply now' || txt === 'quick apply' || txt === 'apply on naukri' ||
                 txt.includes('company site') || txt.includes('employer website');
        });
        if (btn) return btn;

        // 2. Fallback: If #apply-button exists but offsetWidth is 0 (e.g. inside sticky header)
        const anyApply = document.getElementById('apply-button') || document.querySelector('button.apply-button, button[class*="apply-button"]');
        if (anyApply) {
          try { anyApply.scrollIntoView({ behavior: 'instant', block: 'center' }); } catch (_) {}
          return anyApply;
        }

        await sleep(250);
      }
      return null;
    }

    const applyBtn = await waitForDetailApplyButton(8000);

    if (!applyBtn) {
      // Check if already applied text exists on page
      const bodyText = (document.body?.innerText || '').toLowerCase();
      if (bodyText.includes('already applied') || bodyText.includes('you have already applied') || bodyText.includes('applied on')) {
        log(`ℹ️ Already applied to "${title}" at "${company}".`, 'info');
        setBtnUi('ℹ️ Already Applied!', '#3b82f6', false);
        await chrome.runtime.sendMessage({
          action: 'UPDATE_STATS',
          delta: { skipped: 1, reason: 'already_applied' }
        });
        return finishDetail('skipped', 'already_applied');
      }

      // Check if genuinely logged out (only when NO apply button exists and a login action is shown)
      const hasLoginPrompt = Boolean(document.querySelector(
        '#continue-with-google-button, .continue-with-google-button, [class*="apply-button-container"] a[href*="login"], [class*="apply-button-container"] button[class*="login"]'
      ));
      if (hasLoginPrompt) {
        log('⚠️ Naukri login required to apply.', 'warning');
        setBtnUi('⚠️ Please Login to Naukri to Apply', '#f59e0b', false);
        updateFloatingPill('⚠️ Please Login to Naukri to Apply', { isDone: true, status: 'warning', showStop: false });
        await chrome.runtime.sendMessage({
          action: 'SAVE_JOB',
          job: { title, company, url: jobUrl, reason: 'Naukri Login Required', contactInfo }
        });
        return finishDetail('saved', 'login_required', true);
      }

      log(`⚠️ Apply button not found on "${title}". Saving to Saved Jobs.`, 'warning');
      setBtnUi('⚠️ Apply Button Not Found', '#ef4444', false);
      await chrome.runtime.sendMessage({
        action: 'SAVE_JOB',
        job: { title, company, url: jobUrl, reason: 'Apply Button Not Found on Details', contactInfo }
      });
      return finishDetail('saved', 'apply_button_not_found');
    }

    const btnText = (applyBtn.textContent || applyBtn.value || '').toLowerCase().trim();

    // 2. Check if already applied button
    if (btnText.includes('already applied') || (applyBtn.disabled && btnText.includes('applied'))) {
      log(`ℹ️ Already applied to "${title}" at "${company}".`, 'info');
      setBtnUi('ℹ️ Already Applied!', '#3b82f6', false);
      await chrome.runtime.sendMessage({
        action: 'UPDATE_STATS',
        delta: { skipped: 1, reason: 'already_applied' }
      });
      return finishDetail('skipped', 'already_applied');
    }

    // 3. Check if external Company Site button
    if (btnText.includes('company site') || btnText.includes('employer website') || btnText.includes('apply on company')) {
      log(`📋 External Company Site listing -> Saving to Saved Jobs.`, 'info');
      setBtnUi('📋 External Company Site (Saved)', '#64748b', false);
      const companyUrl = applyBtn.href || (applyBtn.closest('a') ? applyBtn.closest('a').href : jobUrl);
      const reasonText = contactInfo.hasContact
        ? `External Site + 📞 Direct Contact: ${contactInfo.summary}`
        : 'External Company Site';
      await chrome.runtime.sendMessage({
        action: 'SAVE_JOB',
        job: { title, company, url: companyUrl, reason: reasonText, contactInfo }
      });
      return finishDetail('saved', 'company_site');
    }

    // 4. Click the Apply button!
    log(`⚡ Clicking Apply button for "${title}" at "${company}"...`, 'info');
    setBtnUi('⚡ Opening application...', '#10b981', true);
    window.NaukriFormFiller?.triggerHumanClick(applyBtn);
    await sleep(1500);

    // Check if clicking Apply prompted an unexpected login modal (e.g. session expired)
    const loginModal = document.querySelector('#login-modal, div[class*="auth-modal"], div[class*="login-container"]');
    if (loginModal && (loginModal.offsetWidth > 0 || window.getComputedStyle(loginModal).display !== 'none')) {
      log('⚠️ Naukri login session expired or required.', 'warning');
      setBtnUi('⚠️ Please Login to Naukri to Apply', '#f59e0b', false);
      updateFloatingPill('⚠️ Please Login to Naukri to Apply', { isDone: true, status: 'warning', showStop: false });
      await chrome.runtime.sendMessage({
        action: 'SAVE_JOB',
        job: { title, company, url: jobUrl, reason: 'Naukri Login Required', contactInfo }
      });
      return finishDetail('saved', 'login_required', true);
    }

    // 5. Check if 1-click apply succeeded immediately without opening drawer
    if (window.NaukriFormFiller?.isApplicationSubmitted()) {
      log(`🎉 Applied successfully to "${title}" at "${company}"!`, 'success');
      playAudioChime();
      setBtnUi('🎉 Applied Successfully!', '#059669', false);
      updateFloatingPill('🎉 Applied Successfully!', { isDone: true, status: 'success', showStop: false });
      await chrome.runtime.sendMessage({
        action: 'JOB_APPLIED',
        job: { title, company, url: jobUrl, contactInfo }
      });
      await sleep(1000);
      return finishDetail('applied');
    }

    // 7. Run Application Wizard for drawer / chatbot screening questions
    setBtnUi('📝 Auto-filling screening questions...', '#10b981', true);
    const wizardResult = await executeApplicationWizard(profile, settings, isManual);

    if (wizardResult.success) {
      log(`🎉 Application wizard submitted successfully for "${title}" at "${company}"!`, 'success');
      playAudioChime();
      setBtnUi('🎉 Applied Successfully!', '#059669', false);
      updateFloatingPill('🎉 Applied Successfully!', { isDone: true, status: 'success', showStop: false });
      await chrome.runtime.sendMessage({
        action: 'JOB_APPLIED',
        job: { title, company, url: jobUrl, contactInfo }
      });
      await sleep(1000);
      return finishDetail('applied');
    } else {
      const failReason = wizardResult.reason === 'unresolved_fields' ? 'Unresolved Screening Questions' :
                         wizardResult.reason === 'max_steps_exceeded' ? 'Multi-Step Limit' :
                         (wizardResult.reason || 'Manual Review Required');

      log(`✍️ Application paused: ${failReason}. Please answer the questions and click Apply.`, 'warning');
      playAudioChime();
      setBtnUi('✍️ Please answer questions & click Apply', '#f59e0b', false);
      updateFloatingPill('✍️ Please answer questions & click Apply', { isDone: true, status: 'warning', showStop: false });

      const saveReason = contactInfo.hasContact
        ? `Incomplete: ${failReason} + 📞 Direct Contact: ${contactInfo.summary}`
        : `Incomplete: ${failReason}`;

      await chrome.runtime.sendMessage({
        action: 'SAVE_JOB',
        job: { title, company, url: jobUrl, reason: saveReason, contactInfo }
      });
      return finishDetail('saved', failReason, true /* keepTabOpen */);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Standalone Job Details Page: Floating UI Widget (Unified with bottom-left status pill)
  function renderDetailFloatingWidget({
    state, // 'auto_applying', 'already_applied', 'company_site', 'mismatch'
    reason = '',
    onClickApply = null
  }) {
    // Ensure any legacy buttons are removed
    const oldBtn = document.getElementById('naukri-standalone-auto-apply-btn');
    if (oldBtn) oldBtn.remove();

    if (state === 'auto_applying') {
      updateFloatingPill('⚡ Filter Matched! Auto-Applying...', {
        isDone: false,
        status: 'running',
        showStop: true
      });
    } else if (state === 'already_applied') {
      updateFloatingPill('ℹ️ Already Applied', {
        isDone: true,
        status: 'info',
        showStop: false
      });
    } else if (state === 'company_site') {
      updateFloatingPill('📋 External Company Site (Auto-Saved)', {
        isDone: true,
        status: 'info',
        showStop: false
      });
    } else if (state === 'mismatch') {
      updateFloatingPill(`⏭️ ${reason || 'Filtered Out'}`, {
        isDone: true,
        status: 'mismatch',
        showStop: false,
        actionButton: onClickApply ? {
          text: 'Apply Anyway',
          bg: '#059669',
          onClick: onClickApply
        } : null
      });
    }
  }

  // Standalone Job Details Page: Evaluate Filters & Autonomously Apply
  // Standalone page check: evaluate filters and autonomously apply on matching listings
    // Dedicated handler for Naukri's saveApply error / confirmation landing page
  function handleSaveApplyPage() {
    const pageText = (document.body?.innerText || '').toLowerCase();
    const isRejected = pageText.includes('your application was not accepted') ||
                       pageText.includes('application was not accepted') ||
                       pageText.includes('due to incomplete information') ||
                       pageText.includes('please answer all mandatory questions');

    if (isRejected) {
      log('⚠️ Application not accepted by Naukri due to incomplete mandatory questions or profile details.', 'warning');
      playAudioChime();

      updateFloatingPill('⚠️ Application Incomplete: Mandatory Questions or Profile Details Required', {
        isDone: true,
        status: 'warning',
        showStop: false,
        actionButton: {
          text: '↩️ Return to Job',
          bg: '#f59e0b',
          onClick: () => {
            if (window.history.length > 1) {
              window.history.back();
            }
          }
        }
      });

      chrome.runtime.sendMessage({
        action: 'SAVE_JOB',
        job: {
          title: document.title || 'Job Listing',
          company: 'Naukri Listing',
          url: window.location.href,
          reason: '⚠️ Incomplete: Naukri rejected application (Mandatory questions / profile details required)'
        }
      }).catch(() => {});
    } else if (
      pageText.includes('applied successfully') ||
      pageText.includes('application sent') ||
      pageText.includes('successfully applied') ||
      pageText.includes('thank you for applying')
    ) {
      log('🎉 Application confirmed on saveApply page!', 'success');
      playAudioChime();
      updateFloatingPill('🎉 Applied Successfully!', { isDone: true, status: 'success', showStop: false });
    }
  }

  // Auto-start crawler if session is running upon load on search pages
  chrome.storage.local.get(['autoApplySession'], (data) => {
    if (data.autoApplySession && data.autoApplySession.isRunning) {
      if (!window.location.pathname.includes('/job-listings') && !window.location.pathname.includes('/job-desc') && !window.location.pathname.includes('/myapply/saveApply')) {
        setTimeout(() => {
          runCrawlSession();
        }, 1500);
      }
    }
  });
})();
