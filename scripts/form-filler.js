/**
 * Naukri Automated Job Application - Form Filler Wizard
 * Autonomous multi-step form wizard for Naukri.com apply drawers,
 * chatbot screening modals, resume selection, auto-learning, and submit detection.
 */

(function () {
  const CONTAINER_SELECTORS = [
    '#chatbot-container',
    '#custom-resume',
    '[id*="chatbot"]',
    '[id*="custom-resume"]',
    '[id*="apply-drawer"]',
    '[id*="apply_drawer"]',
    '.naukri-drawer',
    '.drawer-wrapper',
    '.apply-drawer',
    '.chatbot-container',
    '.modal-container',
    'div[class*="drawer-wrapper"]',
    'div[class*="apply-drawer"]',
    'div[class*="applyDrawer"]',
    'div[class*="drawer_"]',
    'div[class*="drawer"]',
    'section[class*="drawer"]',
    'aside[class*="drawer"]',
    'div[class*="modal"]',
    'div[class*="chatbot"]',
    'div[class*="chat-"]',
    'div.apply-message',
    'div.tuple-apply',
    'div[role="dialog"]',
    '[aria-modal="true"]',
    'form[name*="apply"]',
    'form[id*="apply"]'
  ];

  const EXCLUDED_SELECTORS = [
    'form[name="searchForm"]',
    '.nMainNavbar',
    '.search-box',
    '#qsb-keys-sug',
    'header',
    'nav',
    '#job_header',
    '.styles_job-header-container___0wLZ',
    '[class*="job-header"]',
    '[class*="apply-button-container"]',
    '.styles_jhc__apply-button-container__5Bqnb',
    '#login-modal',
    'div[class*="auth-modal"]',
    'div[class*="login-container"]',
    '#feedback-form'
  ];

  const STOPWORDS = new Set([
    'what', 'when', 'where', 'which', 'who', 'whom', 'whose', 'why', 'how',
    'have', 'having', 'your', 'with', 'from', 'this', 'that', 'these', 'those',
    'please', 'enter', 'select', 'provide', 'type', 'message', 'here', 'many',
    'years', 'year', 'experience', 'about', 'some', 'any'
  ]);

  function autoSaveLearnedQA(qText, answer, profileArg) {
    if (!qText || !answer) return;
    const saveToProfile = (profile) => {
      profile.screening = profile.screening || [];
      const cleanQ = qText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
      const alreadyExists = profile.screening.some(item => cleanQ.includes(item.keywords.toLowerCase()) || item.keywords.toLowerCase().includes(cleanQ));
      if (!alreadyExists) {
        const keywords = cleanQ.split(' ').filter(w => w.length > 3 && !STOPWORDS.has(w)).slice(0, 4).join(', ');
        if (keywords && keywords.length >= 3) {
          profile.screening.push({ keywords, answer: String(answer) });
          try {
            chrome.storage.local.set({ userProfile: profile });
            console.log(`[FormFiller Auto-Learn] Dynamically Saved: "${keywords}" -> "${answer}"`);
          } catch (_) {}
        }
      }
    };

    if (profileArg) {
      saveToProfile(profileArg);
    } else {
      try {
        chrome.storage.local.get(['userProfile'], (res) => {
          if (res?.userProfile) saveToProfile(res.userProfile);
        });
      } catch (_) {}
    }
  }

  // Helper to simulate full human click events for React state
  function triggerHumanClick(el) {
    if (!el) return;
    try {
      el.focus();
    } catch (_) {}
    try {
      // Native click is ESSENTIAL for React 17/18 synthetic events
      el.click();
    } catch (_) {}
    try {
      ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach(type => {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, buttons: 1, view: window }));
      });
    } catch (_) {}
  }

  // Get active application drawer, modal, or chatbot questionnaire
  function getActiveContainer(doc = document) {
    // 1. Search known container selectors, prioritizing ones that contain form controls
    for (const sel of CONTAINER_SELECTORS) {
      const candidates = doc.querySelectorAll(sel);
      for (const el of candidates) {
        if (!el || el.offsetWidth === 0 || el.offsetHeight === 0) continue;
        if (EXCLUDED_SELECTORS.some(exc => el.closest(exc))) continue;
        if (el.querySelectorAll('input:not([type="hidden"]), textarea, select, [role="checkbox"], [role="radio"], [class*="bubble" i], [class*="bot-msg" i], [class*="bot" i], [class*="question" i], [class*="option" i], [class*="chip" i]').length > 0) {
          return el;
        }
      }
    }

    // 2. Dynamic Discovery: Any visible overlay, dialog, or section that has form inputs/questions
    const overlays = Array.from(doc.querySelectorAll('div[role="dialog"], [aria-modal="true"], aside, section, div[style*="z-index"]'))
      .filter(el => {
        if (el.offsetWidth === 0 || el.offsetHeight === 0) return false;
        if (EXCLUDED_SELECTORS.some(exc => el.closest(exc))) return false;
        const count = el.querySelectorAll('input, textarea, select, [role="radio"], [role="checkbox"], [class*="chip"], [class*="option" i]').length;
        return count > 0;
      });

    if (overlays.length > 0) {
      return overlays[overlays.length - 1];
    }

    // Dedicated apply route (e.g. naukri.com/apply-...)
    if (window.location.pathname.startsWith('/apply') || window.location.href.includes('/apply-job')) {
      return doc.body;
    }

    // Question container detection fallback
    const anyQuestions = doc.querySelectorAll(
      '.question-container, div[class*="Question"], div[class*="question"], fieldset, [role="radiogroup"], div[class*="bot-message"], div[class*="chat-message"], div[class*="bubble" i]'
    );
    for (const q of anyQuestions) {
      if (q.offsetWidth > 0 && q.offsetHeight > 0 && !EXCLUDED_SELECTORS.some(exc => q.closest(exc))) {
        return q.closest('form, div[id*="container"], section, div') || doc.body;
      }
    }

    return null;
  }

  // Set React input value safely
  function setReactInputValue(el, value) {
    if (!el || value === undefined || value === null) return false;
    if (el.disabled) return false;

    const valStr = String(value);
    if (el.value === valStr) return false;

    const isTextArea = (el.tagName || '').toLowerCase() === 'textarea';
    const proto = isTextArea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

    if (setter) {
      setter.call(el, valStr);
    } else {
      el.value = valStr;
    }

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));

    el.classList.add('naukri-auto-filled');
    return true;
  }

  // Associate label text with input
  function getFieldLabelText(el) {
    if (!el) return '';
    let labels = [];

    // 1. Explicit label[for]
    if (el.id) {
      try {
        const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lbl) labels.push(lbl.textContent);
      } catch (_) {}
    }

    // 2. Parent label
    const parentLabel = el.closest('label');
    if (parentLabel) labels.push(parentLabel.textContent);

    // 3. Descriptive Attributes
    const attrs = [
      el.getAttribute('aria-label'),
      el.getAttribute('placeholder'),
      el.getAttribute('title'),
      el.name,
      el.id
    ];
    attrs.forEach(a => { if (a) labels.push(a); });

    // 4. Preceding sibling text elements
    let prev = el.previousElementSibling;
    while (prev) {
      labels.push(prev.textContent);
      prev = prev.previousElementSibling;
    }

    // 5. Parent question container header
    const group = el.closest(
      '.question-container, .form-group, .input-field, fieldset, [class*="question" i], [class*="field" i], [class*="form-row" i], [class*="chat-msg" i], [class*="bot-msg" i], li, tr'
    ) || el.parentElement?.parentElement;

    if (group) {
      const header = group.querySelector('legend, h1, h2, h3, h4, h5, h6, label, [class*="title" i], [class*="label" i], [class*="header" i], [class*="text" i], p, span');
      if (header) labels.push(header.textContent);
    }

    return labels.join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // Handle Radio Button Groups & Chip/Pill Selections (Locations, Yes/No, Relocation, Screening Q&A)
  function handleRadioGroups(container, profile) {
    if (!container || !profile) return 0;
    let filled = 0;
    const userCity = (profile.personal?.city || 'Bengaluru').toLowerCase();

    const groups = container.querySelectorAll(
      'fieldset, [role="radiogroup"], .question-container, div[class*="Question"], div[class*="question"], div[class*="radio-group"], div[class*="chip-group"], div[class*="chips"], div[class*="options"]'
    );

    groups.forEach(grp => {
      const header = grp.querySelector('legend, h1, h2, h3, h4, label, [class*="title"], [class*="header"], [class*="question"]') || grp;
      const qText = header.textContent.toLowerCase().trim();

      // 1. Check for standard radio inputs
      const radios = Array.from(grp.querySelectorAll('input[type="radio"]'));
      if (radios.length > 0) {
        if (radios.some(r => r.checked)) return;

        let targetRadio = null;

        if (qText.includes('located in') || qText.includes('live in') || qText.includes('reside in') || qText.includes('current location')) {
          const mentionsCity = qText.includes(userCity) || (userCity.includes('bengaluru') && qText.includes('bangalore'));
          targetRadio = radios.find(r => {
            const t = (r.parentElement?.textContent || '').toLowerCase();
            return mentionsCity ? t.includes('yes') : t.includes('no');
          });
        } else if (qText.includes('relocate') || qText.includes('commute') || qText.includes('work from office') || qText.includes('comfortable')) {
          if (profile.work?.targetRole?.willingToRelocate === true) {
            targetRadio = radios.find(r => {
              const t = (r.parentElement?.textContent || '').toLowerCase();
              return t.includes('yes') || t.includes('relocate') || t.includes('commute');
            });
          }
        } else if (profile.screening && window.NaukriMatcher) {
          const match = window.NaukriMatcher.findScreeningAnswer(qText, profile.screening);
          if (match && match.answer) {
            const ans = match.answer.toLowerCase();
            targetRadio = radios.find(r => {
              const t = (r.parentElement?.textContent || '').toLowerCase();
              return t.includes(ans) || (ans === 'yes' && t.includes('yes')) || (ans === 'no' && t.includes('no'));
            });
          }
        }

        if (targetRadio && !targetRadio.checked) {
          triggerHumanClick(targetRadio);
          targetRadio.checked = true;
          targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
          filled++;
          return;
        }
      }

      // 2. Check for Chip / Pill / Button style options (common on Naukri)
      const chips = Array.from(grp.querySelectorAll(
        '[class*="chip"], [class*="pill"], [class*="option"], [class*="choice"], [role="radio"], button, label'
      )).filter(el => el.offsetWidth > 0 && el.offsetHeight > 0 && el !== header);

      if (chips.length > 0) {
        if (chips.some(c => c.classList.contains('selected') || c.classList.contains('active') || c.getAttribute('aria-checked') === 'true')) {
          return;
        }

        let targetChip = null;

        if (qText.includes('relocate') || qText.includes('commute') || qText.includes('work from office') || qText.includes('comfortable') || qText.includes('willing')) {
          if (profile.work?.targetRole?.willingToRelocate === true) {
            targetChip = chips.find(c => {
              const t = (c.textContent || '').trim().toLowerCase();
              return t === 'yes' || t.startsWith('yes') || t.includes('agree');
            });
          }
        } else if (profile.screening && window.NaukriMatcher) {
          const match = window.NaukriMatcher.findScreeningAnswer(qText, profile.screening);
          if (match && match.answer) {
            const ans = match.answer.toLowerCase();
            targetChip = chips.find(c => {
              const t = (c.textContent || '').trim().toLowerCase();
              return t === ans || t.includes(ans) || (ans === 'yes' && t.includes('yes')) || (ans === 'no' && t.includes('no'));
            });
          }
        }

        if (targetChip) {
          triggerHumanClick(targetChip);
          filled++;
        }
      }
    });

    return filled;
  }

  // Helper to evaluate and select the best multiple-choice option for candidate
  function evaluateBestChoice(qText, choices, profile) {
    const qLower = (qText || '').toLowerCase();

    // 1. Check Profile Screening Q&A Bank first!
    if (profile.screening && window.NaukriMatcher) {
      const match = window.NaukriMatcher.findScreeningAnswer(qText, profile.screening);
      if (match && match.answer) {
        const targetAns = match.answer.toLowerCase().trim();
        // Exact or partial text match
        const exact = choices.find(c => c.lower === targetAns || c.lower.startsWith(targetAns) || c.lower.includes(targetAns) || targetAns.includes(c.lower));
        if (exact) return exact;

        // If numeric answer (e.g. "4" for Excel experience), map to choice ranges or qualitative tiers
        const numVal = parseFloat(targetAns);
        if (!isNaN(numVal)) {
          // 1a. Numeric range match (e.g. "3-5 years", "3+ years")
          for (const c of choices) {
            const rangeMatch = c.lower.match(/(\d+)\s*(?:-|to|\+)\s*(\d*)/);
            if (rangeMatch) {
              const min = parseFloat(rangeMatch[1]);
              const max = rangeMatch[2] ? parseFloat(rangeMatch[2]) : 99;
              if (numVal >= min && numVal <= max) return c;
            }
          }

          // 1b. Qualitative choice scale mapped from candidate's verified screening number
          if (numVal >= 3) {
            const highChoice = choices.find(c =>
              c.lower.includes('extensively') || c.lower.includes('expert') ||
              c.lower.includes('advanced') || c.lower.includes('frequently') ||
              c.lower.includes('high') || c.lower.includes('excellent') || c.lower === 'yes'
            );
            if (highChoice) return highChoice;
          } else if (numVal >= 1) {
            const midChoice = choices.find(c =>
              c.lower.includes('intermediate') || c.lower.includes('occasionally') ||
              c.lower.includes('moderate') || c.lower.includes('medium') || c.lower === 'yes'
            );
            if (midChoice) return midChoice;
          } else if (numVal === 0) {
            const lowChoice = choices.find(c =>
              c.lower.includes('no') || c.lower.includes('beginner') || c.lower.includes('none')
            );
            if (lowChoice) return lowChoice;
          }
        }
      }
    }

    // 2. Direct Candidate Profile Attributes
    // A. Notice Period / Availability (from profile)
    if (qLower.includes('notice') || qLower.includes('how soon') || qLower.includes('availability') || qLower.includes('joining')) {
      const userNotice = (profile.work?.targetRole?.noticePeriod || '').toLowerCase().trim();
      if (userNotice) {
        const match = choices.find(c => c.lower.includes(userNotice) || userNotice.includes(c.lower));
        if (match) return match;
      }
    }

    // B. Current City / Location (from profile)
    if (qLower.includes('located in') || qLower.includes('live in') || qLower.includes('reside in') || qLower.includes('current location') || qLower.includes('current city')) {
      const userCity = (profile.personal?.city || '').toLowerCase().trim();
      if (userCity) {
        const mentionsCity = qLower.includes(userCity) || (userCity.includes('bengaluru') && qLower.includes('bangalore'));
        const targetWord = mentionsCity ? 'yes' : 'no';
        const match = choices.find(c => c.lower === targetWord || c.lower.startsWith(targetWord));
        if (match) return match;
      }
    }

    // C. Willingness to Relocate (from profile)
    if (qLower.includes('relocate') || qLower.includes('relocation')) {
      if (profile.work?.targetRole?.willingToRelocate === true) {
        const yesMatch = choices.find(c => c.lower === 'yes' || c.lower.startsWith('yes'));
        if (yesMatch) return yesMatch;
      }
    }

    // D. Total Years of Experience (ONLY if question specifically asks for total/overall experience, NOT a specific skill!)
    if ((qLower.includes('total experience') || qLower.includes('total exp') || qLower.includes('overall experience') || qLower.includes('total years of experience')) && !qLower.includes('in ') && !qLower.includes('with ')) {
      const totalExp = parseFloat(profile.work?.currentRole?.yearsExperience || profile.autoApplierSettings?.userYearsExp);
      if (!isNaN(totalExp)) {
        for (const c of choices) {
          const rangeMatch = c.lower.match(/(\d+)\s*(?:-|to|\+)\s*(\d*)/);
          if (rangeMatch) {
            const min = parseFloat(rangeMatch[1]);
            const max = rangeMatch[2] ? parseFloat(rangeMatch[2]) : 99;
            if (totalExp >= min && totalExp <= max) return c;
          }
        }
      }
    }

    // E. Education Degree / Qualification (from profile)
    if (qLower.includes('highest qualification') || qLower.includes('highest degree') || qLower.includes('education level')) {
      const userDegree = (profile.education?.degree || '').toLowerCase().trim();
      if (userDegree) {
        const match = choices.find(c => c.lower.includes(userDegree) || userDegree.includes(c.lower));
        if (match) return match;
      }
    }

    // ABSOLUTE RULE: If not matched by verified candidate profile data, NEVER guess!
    // Return null so the question remains unanswered, the wizard pauses, and the user answers it.
    return null;
  }

  // Safely select an option element and synchronize React synthetic state
  function selectChoiceOption(choice) {
    if (!choice || !choice.element) return false;
    const el = choice.element;
    const input = choice.input || el.querySelector('input[type="checkbox"], input[type="radio"]');

    if (input) {
      if (input.checked) return true; // Already selected

      // 1. Single direct click on input
      try {
        input.focus();
        input.click();
      } catch (_) {}

      // 2. If input didn't check (e.g. styled label or container captures click), click element once
      if (!input.checked) {
        try {
          el.focus();
          el.click();
        } catch (_) {}
      }

      // 3. React prototype setter fallback if still not checked
      if (!input.checked) {
        try {
          const proto = window.HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'checked')?.set;
          if (setter) {
            setter.call(input, true);
          } else {
            input.checked = true;
          }
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (_) {}
      }

      return Boolean(input.checked);
    } else {
      // Custom clickable element (div, span, li, chip)
      try {
        el.focus();
        el.click();
      } catch (_) {}
      return true;
    }
  }

  // Helper to extract and deduplicate choices from any scope
  function extractChoicesFromScope(scope) {
    if (!scope) return [];

    const candidates = Array.from(scope.querySelectorAll(
      'input[type="checkbox"], input[type="radio"], [role="checkbox"], [role="radio"], [role="option"], ' +
      'label, li, [class*="option" i], [class*="choice" i], [class*="item" i], [class*="chip" i], ' +
      '[class*="pill" i], [class*="checkbox" i], [class*="radio" i], [class*="selection" i], [class*="ans" i], button'
    )).filter(el => {
      if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
      if (el.id === 'apply-button' || el.id === 'naukri-btn-instant-apply' || el.closest('#naukri-auto-applier-pill') || el.closest('#naukri-standalone-auto-apply-btn')) return false;
      if ((el.classList?.contains && el.classList.contains('close')) || el.getAttribute?.('aria-label') === 'Close' || el.closest?.('.crossIcon, [class*="close" i]')) return false;
      const txt = (el.textContent || el.value || '').trim();
      if (!txt || txt.length < 1 || txt.length > 80) return false;
      const lower = txt.toLowerCase();
      if (lower === 'apply' || lower === 'submit' || lower.includes('save & next') || lower.includes('save and next') || lower === 'continue' || lower === 'next') return false;
      return true;
    });

    const uniqueChoices = [];
    const seenTexts = new Set();

    for (const el of candidates) {
      const clickableEl = el.closest?.('label, li, [class*="item" i], [class*="option" i], [class*="choice" i], [class*="row" i]') || el;
      const optText = (clickableEl.textContent || clickableEl.value || '').trim().replace(/\s+/g, ' ');
      const optKey = optText.toLowerCase();

      if (optKey.length < 1 || optKey.length > 80 || seenTexts.has(optKey)) continue;

      const isChecked = Boolean(
        (clickableEl.classList?.contains && (clickableEl.classList.contains('selected') || clickableEl.classList.contains('active'))) ||
        clickableEl.getAttribute?.('aria-checked') === 'true' ||
        (clickableEl.querySelector && clickableEl.querySelector('input')?.checked) ||
        (clickableEl.tagName === 'INPUT' && clickableEl.checked) ||
        (clickableEl.querySelector && clickableEl.querySelector('.styles_checked, [class*="checked" i], [class*="selected" i]'))
      );

      seenTexts.add(optKey);
      uniqueChoices.push({
        element: clickableEl,
        input: (clickableEl.querySelector && clickableEl.querySelector('input')) || (el.tagName === 'INPUT' ? el : null),
        text: optText,
        lower: optKey,
        isChecked
      });
    }

    return uniqueChoices;
  }

  // Handle Screening Choices (MCQ, Checkboxes, Radios, Chatbot Option Lists)
  function handleScreeningChoices(containerArg, profile) {
    const container = containerArg || getActiveContainer() || document.body;
    if (!container || !profile) return 0;
    let filled = 0;

    // 1. Check for explicit question blocks (forms with multiple questions)
    const explicitBlocks = Array.from(container.querySelectorAll(
      'fieldset, [role="radiogroup"], .question-container, div[class*="Question" i], div[class*="question-wrapper" i], div[class*="form-group" i]'
    )).filter(b => b.offsetWidth > 0 && b.offsetHeight > 0 && b.querySelectorAll('input, label, li, [role="checkbox"], [role="radio"]').length > 0);

    if (explicitBlocks.length > 0) {
      for (const block of explicitBlocks) {
        const headerEl = block.querySelector('legend, h1, h2, h3, h4, h5, h6, [class*="title" i], [class*="header" i], [class*="label" i], p') || block;
        const qText = (headerEl.textContent || '').toLowerCase().trim();
        const choices = extractChoicesFromScope(block);
        if (choices.length === 0 || choices.some(c => c.isChecked)) continue;

        const bestChoice = evaluateBestChoice(qText, choices, profile);
        if (bestChoice && selectChoiceOption(bestChoice)) {
          autoSaveLearnedQA(qText, bestChoice.text, profile);
          filled++;
        }
      }
      if (filled > 0) return filled;
    }

    // 2. Chatbot or Single Questionnaire layout
    // Find active question text: the latest bot message/prompt
    const botMessages = Array.from(container.querySelectorAll(
      '[class*="bot-msg" i], [class*="botMsg" i], [class*="bot-message" i], [class*="botMessage" i], ' +
      '[class*="bot-text" i], [class*="bubble" i], [class*="msg-left" i], [class*="left-msg" i], ' +
      '[class*="message-left" i], [class*="chat-bubble" i], [class*="question" i], [class*="msgText" i], ' +
      'div[class*="bot" i] p, div[class*="bot" i] span, p[class*="text" i], div[class*="msg" i]'
    )).filter(m => {
      if (m.offsetWidth === 0 && m.offsetHeight === 0) return false;
      const t = (m.textContent || '').trim();
      return t.length > 5 && !t.toLowerCase().includes('type message') && !t.includes('Auto-Applying');
    });

    let qText = '';
    if (botMessages.length > 0) {
      qText = (botMessages[botMessages.length - 1].textContent || '').toLowerCase().trim();
    } else {
      const heading = container.querySelector('h1, h2, h3, h4, h5, [class*="title" i], [class*="heading" i], [class*="question" i], p');
      if (heading) qText = (heading.textContent || '').toLowerCase().trim();
    }

    // Find all choices in container
    const choices = extractChoicesFromScope(container);
    if (choices.length > 0) {
      if (!choices.some(c => c.isChecked)) {
        const bestChoice = evaluateBestChoice(qText, choices, profile);
        if (bestChoice && selectChoiceOption(bestChoice)) {
          autoSaveLearnedQA(qText, bestChoice.text, profile);
          filled++;
        }
      } else {
        // Option already selected on this step
        filled++;
      }
    }

    return filled;
  }

  // Handle Custom Dropdowns & Comboboxes (Notice period, experience, city, screening Q&A)
  function handleCustomDropdowns(container, profile) {
    if (!container || !profile) return 0;
    let filled = 0;

    const dropdownContainers = container.querySelectorAll(
      '[role="combobox"], .custom-select, div[class*="dropdown" i], div[class*="select-box" i], div[class*="selectContainer" i], div[class*="select-wrapper" i], div[class*="customSelect" i]'
    );

    dropdownContainers.forEach(drop => {
      if (drop.offsetWidth === 0 && drop.offsetHeight === 0) return;
      const label = getFieldLabelText(drop);
      if (!label) return;

      let targetVal = null;
      if (label.includes('notice period') || label.includes('availability') || label.includes('how soon')) {
        targetVal = profile.work?.targetRole?.noticePeriod || 'Immediate';
      } else if (label.includes('experience') || label.includes('exp')) {
        targetVal = String(profile.work?.currentRole?.yearsExperience || 1);
      } else if (label.includes('city') || label.includes('location')) {
        targetVal = profile.personal?.city || 'Bengaluru';
      } else if (profile.screening && window.NaukriMatcher) {
        const match = window.NaukriMatcher.findScreeningAnswer(label, profile.screening);
        if (match && match.answer) targetVal = match.answer;
      }

      if (!targetVal) return;
      const targetStr = String(targetVal).toLowerCase().trim();

      const currentSelected = (drop.textContent || '').toLowerCase();
      if (currentSelected.includes(targetStr) && !currentSelected.includes('select')) {
        return;
      }

      // Click the trigger to open the options list
      const trigger = drop.querySelector('input, [class*="trigger" i], [class*="arrow" i], [class*="selected" i], [class*="display" i], [role="button"]') || drop;
      triggerHumanClick(trigger);

      // Search inside container and document portals
      const searchScopes = [drop, document];
      for (const scope of searchScopes) {
        const options = Array.from(scope.querySelectorAll(
          '[role="option"], li[class*="item" i], div[class*="option" i], [class*="dropdownItem" i], [class*="dropdown-item" i], li'
        )).filter(opt => opt.offsetWidth > 0 && opt.offsetHeight > 0);

        const matchOpt = options.find(opt => {
          const txt = (opt.textContent || '').toLowerCase().trim();
          return txt === targetStr || txt.includes(targetStr) ||
                 (targetStr === 'immediate' && (txt.includes('15 days') || txt.includes('immediate') || txt.includes('less than')));
        });

        if (matchOpt) {
          triggerHumanClick(matchOpt);
          filled++;
          return;
        }
      }
    });

    return filled;
  }

  // Handle Chatbot / Conversational Questions & Quick Reply Chips
  function handleChatbotStep(container, profile) {
    if (!container || !profile) return 0;

    // 1. Discover Chat Input Box across all variants (input, textarea, contenteditable, placeholder matches)
    const chatInput = container.querySelector(
      'input[placeholder*="message" i], textarea[placeholder*="message" i], ' +
      'input[placeholder*="type" i], textarea[placeholder*="type" i], ' +
      'input[placeholder*="answer" i], textarea[placeholder*="answer" i], ' +
      'input[placeholder*="reply" i], textarea[placeholder*="reply" i], ' +
      'input[class*="chat" i], textarea[class*="chat" i], ' +
      '[class*="chat-input" i] input, [class*="chat-input" i] textarea, ' +
      '[class*="chatbot-input" i] input, [class*="chatbot-input" i] textarea, ' +
      'div[contenteditable="true"], input[type="text"], textarea'
    ) || document.querySelector(
      '[class*="drawer" i] input, [class*="chatbot" i] input, [class*="drawer" i] textarea, [class*="chatbot" i] textarea'
    );
    if (!chatInput) return 0;
    if (chatInput.disabled || (chatInput.offsetWidth === 0 && chatInput.offsetHeight === 0)) return 0;

    // 2. Discover the Active Bot Question Text
    const botMessages = Array.from(container.querySelectorAll(
      '[class*="bot-msg" i], [class*="botMsg" i], [class*="bot-message" i], [class*="botMessage" i], ' +
      '[class*="bot-text" i], [class*="bubble" i], [class*="msg-left" i], [class*="left-msg" i], ' +
      '[class*="message-left" i], [class*="chat-bubble" i], [class*="question" i], [class*="msgText" i], ' +
      'div[class*="bot" i] p, div[class*="bot" i] span, p[class*="text" i], div[class*="msg" i]'
    )).filter(m => {
      if (m.offsetWidth === 0 && m.offsetHeight === 0) return false;
      const t = (m.textContent || '').trim();
      return t.length > 5 && !t.toLowerCase().includes('type message') && !t.includes('Auto-Applying');
    });

    let qText = '';
    if (botMessages.length > 0) {
      qText = (botMessages[botMessages.length - 1].textContent || '').toLowerCase().trim();
    } else {
      // Fallback: search all paragraphs/spans in container for a question or experience prompt
      const textNodes = Array.from(container.querySelectorAll('p, span, div')).filter(el => {
        if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
        const t = (el.textContent || '').trim();
        return t.length > 6 && (t.includes('?') || t.toLowerCase().includes('experience') || t.toLowerCase().includes('years') || t.toLowerCase().includes('how many'));
      });
      if (textNodes.length > 0) {
        qText = (textNodes[textNodes.length - 1].textContent || '').toLowerCase().trim();
      }
    }

    if (!qText) return 0;

    // 3. Dynamic Answer Engine: Evaluate profile & candidate knowledge bank
    let ans = null;

    // Rule 1: Profile Screening Bank Match
    if (profile.screening && window.NaukriMatcher) {
      const match = window.NaukriMatcher.findScreeningAnswer(qText, profile.screening);
      if (match && match.answer) ans = match.answer;
    }

    // Rule 2: Total Years of Experience (ONLY if question asks for total/overall experience, not a specific tool!)
    if (!ans && (
      qText.includes('total experience') ||
      qText.includes('total exp') ||
      qText.includes('overall experience') ||
      qText.includes('total years of experience')
    ) && !qText.includes('in ') && !qText.includes('with ')) {
      const totalExp = profile.work?.currentRole?.yearsExperience !== undefined
        ? profile.work.currentRole.yearsExperience
        : profile.autoApplierSettings?.userYearsExp;
      if (totalExp !== undefined && totalExp !== null) {
        ans = String(totalExp);
      }
    }

    // Rule 3: Salary & CTC (from profile)
    if (!ans) {
      if (qText.includes('current ctc') || qText.includes('current salary') || qText.includes('fixed ctc') || qText.includes('present salary') || qText.includes('fixed annual')) {
        if (profile.work?.currentRole?.currentSalary) {
          ans = String(profile.work.currentRole.currentSalary);
        }
      } else if (qText.includes('expected ctc') || qText.includes('expected salary') || qText.includes('desired salary')) {
        if (profile.work?.targetRole?.expectedSalary) {
          ans = String(profile.work.targetRole.expectedSalary);
        }
      }
    }

    // Rule 4: Notice Period & Availability (from profile)
    if (!ans && (qText.includes('notice period') || qText.includes('availability') || qText.includes('how soon') || qText.includes('joining'))) {
      if (profile.work?.targetRole?.noticePeriod) {
        ans = String(profile.work.targetRole.noticePeriod);
      }
    }

    // Rule 5: City / Location (from profile)
    if (!ans && (qText.includes('city') || qText.includes('current location') || qText.includes('where do you live'))) {
      if (profile.personal?.city) {
        ans = String(profile.personal.city);
      }
    }

    // Rule 6: Relocation (from profile)
    if (!ans && (qText.includes('relocate') || qText.includes('relocation'))) {
      if (profile.work?.targetRole?.willingToRelocate === true) {
        ans = 'Yes';
      }
    }

    // Rule 7: Qualification / Education (from profile)
    if (!ans && (qText.includes('highest qualification') || qText.includes('highest degree') || qText.includes('education level'))) {
      if (profile.education?.degree) {
        ans = String(profile.education.degree);
      }
    }

    // ABSOLUTE RULE: If no answer was derived from profile or screening bank, STOP!
    // Do NOT guess '1', do NOT guess 'Yes', do NOT send arbitrary text into chat!
    if (!ans) {
      return 0;
    }

    // 4. Check for matching quick reply chips first
    const chips = Array.from(container.querySelectorAll(
      '[class*="chip" i], [class*="quick-reply" i], [class*="option" i], [class*="choice" i], button'
    )).filter(c => c.offsetWidth > 0 && c.offsetHeight > 0 && c.type !== 'submit' && !c.classList.contains('close'));

    const targetChip = chips.find(c => {
      const t = (c.textContent || '').toLowerCase().trim();
      return t === ans.toLowerCase() || t.includes(ans.toLowerCase()) || (ans === '1' && (t.includes('1 year') || t.includes('1-2') || t.includes('1 yr')));
    });

    if (targetChip) {
      triggerHumanClick(targetChip);
      return 1;
    }

    // 5. Submit text into Chat Input
    if (chatInput.value !== String(ans)) {
      setReactInputValue(chatInput, ans);
      chatInput.dispatchEvent(new Event('beforeinput', { bubbles: true }));
      chatInput.dispatchEvent(new Event('input', { bubbles: true }));
      chatInput.dispatchEvent(new Event('change', { bubbles: true }));
      chatInput.dispatchEvent(new Event('blur', { bubbles: true }));
      autoSaveLearnedQA(qText, ans, profile);
    }

    // Click send icon or trigger Enter submission
    const sendBtn = container.querySelector(
      'button[class*="send" i], [class*="send-icon" i], [class*="sendBtn" i], [aria-label*="send" i], ' +
      'button[type="submit"], [class*="arrow" i], [class*="enter" i], svg[class*="send" i]'
    ) || chatInput.nextElementSibling;

    if (sendBtn && sendBtn !== chatInput && sendBtn.offsetWidth > 0) {
      triggerHumanClick(sendBtn);
    }

    // Form submission
    if (chatInput.form) {
      try {
        if (typeof chatInput.form.requestSubmit === 'function') {
          chatInput.form.requestSubmit();
        } else {
          chatInput.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      } catch (_) {}
    }

    // Comprehensive KeyboardEvent sequence
    try {
      ['keydown', 'keypress', 'keyup'].forEach(eventType => {
        chatInput.dispatchEvent(new KeyboardEvent(eventType, {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        }));
      });
    } catch (_) {}

    return 1;
  }

  // Handle Resume Selection in Drawer
  function handleResumeSelection(container, profile) {
    if (!container) return false;

    const resumeCards = Array.from(container.querySelectorAll('[data-testid*="resume"], [class*="resume-card"], [class*="resumeCard"], div[role="radio"][class*="resume"], div.uploaded-resume'));
    if (resumeCards.length === 0) return false;

    const targetName = (profile?.work?.targetRole?.targetResumeName || '').toLowerCase().trim();
    let cardToSelect = null;

    if (targetName) {
      cardToSelect = resumeCards.find(c => c.textContent.toLowerCase().includes(targetName));
    }
    if (!cardToSelect) {
      cardToSelect = resumeCards[0];
    }

    if (cardToSelect && !cardToSelect.classList.contains('selected') && cardToSelect.getAttribute('aria-checked') !== 'true') {
      triggerHumanClick(cardToSelect);
      return true;
    }
    return false;
  }

  // Harvest all answered fields in container and save to profile.screening
  function harvestAllContainerAnswers(container) {
    if (!container) return;
    try {
      chrome.storage.local.get(['userProfile'], (res) => {
        const profile = res?.userProfile || {};
        profile.screening = profile.screening || [];

        // Harvest filled inputs
        const inputs = Array.from(container.querySelectorAll('input:not([type="hidden"]), textarea, select'));
        inputs.forEach(el => {
          if (el.type === 'radio' || el.type === 'checkbox') {
            if (el.checked) {
              const label = getFieldLabelText(el);
              const val = (el.parentElement?.textContent || el.value || 'Yes').trim().replace(/\s+/g, ' ');
              if (label && val) autoSaveLearnedQA(label, val, profile);
            }
          } else if (el.value && el.value.trim().length > 0) {
            const label = getFieldLabelText(el);
            if (label) autoSaveLearnedQA(label, el.value.trim(), profile);
          }
        });

        // Harvest selected choices/chips
        const choices = extractChoicesFromScope(container);
        choices.forEach(c => {
          if (c.isChecked) {
            const label = getFieldLabelText(c.element);
            if (label && c.text) autoSaveLearnedQA(label, c.text, profile);
          }
        });
      });
    } catch (_) {}
  }

  // Auto-Learn manual user edits into profile
  function attachAutoLearnListeners(container) {
    if (!container || container.dataset.naukriAutoLearnAttached) return;
    container.dataset.naukriAutoLearnAttached = 'true';

    // 1. Listen for changes on inputs, textareas, selects
    container.addEventListener('change', (e) => {
      const el = e.target;
      if (!el) return;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
        const val = el.type === 'checkbox' ? (el.checked ? (el.value || 'Yes') : '') : (el.value || '').trim();
        if (!val) return;
        const qText = getFieldLabelText(el);
        if (qText && qText.length > 3) {
          autoSaveLearnedQA(qText, val);
        }
      }
    }, true);

    // 2. Listen for clicks on choices, chips, radio buttons, checkboxes
    container.addEventListener('click', (e) => {
      const target = e.target;
      if (!target) return;
      const choiceEl = target.closest('[role="radio"], [role="checkbox"], [role="option"], label, li, [class*="chip" i], [class*="option" i], [class*="choice" i]');
      if (choiceEl && container.contains(choiceEl)) {
        setTimeout(() => {
          const qText = getFieldLabelText(choiceEl);
          const val = (choiceEl.textContent || '').trim().replace(/\s+/g, ' ');
          if (qText && val && val.length < 80) {
            autoSaveLearnedQA(qText, val);
          }
        }, 150);
      }
    }, true);

    // 3. When user clicks Submit or Save & Apply in drawer, harvest ALL answers
    const submitButtons = container.querySelectorAll('button, [role="button"], input[type="submit"]');
    submitButtons.forEach(btn => {
      const txt = (btn.textContent || btn.value || '').toLowerCase().trim();
      if (txt.includes('apply') || txt.includes('submit') || txt.includes('save')) {
        btn.addEventListener('click', () => {
          harvestAllContainerAnswers(container);
        });
      }
    });
  }

  // Fill current step fields
  function fillCurrentStep(profile, containerArg) {
    const container = containerArg || getActiveContainer() || document.body;
    if (!container || !profile) return { filled: 0 };

    attachAutoLearnListeners(container);
    let filledCount = 0;

    // 1. Screening Choices (MCQ, Checkboxes, Radios, Chatbot Option Lists)
    filledCount += handleScreeningChoices(container, profile);

    // 2. Radio groups & Chips
    filledCount += handleRadioGroups(container, profile);

    // 3. Custom Dropdowns & Comboboxes
    filledCount += handleCustomDropdowns(container, profile);

    // 4. Chatbot Conversational Steps
    filledCount += handleChatbotStep(container, profile);

    // 5. Resume selection
    if (handleResumeSelection(container, profile)) {
      filledCount++;
    }

    // 5. Inputs & Textareas
    const inputs = container.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input:not([type]), textarea, select');

    inputs.forEach(el => {
      if ((el.offsetWidth === 0 && el.offsetHeight === 0) || el.disabled) return;
      if (el.type === 'radio' || el.type === 'checkbox' || el.type === 'submit' || el.type === 'button') return;
      if (el.value && el.value.trim().length > 0) return; // Don't overwrite filled fields

      const label = getFieldLabelText(el);
      if (!label) return;

      let valToSet = null;

      // 1. Screening Q&A check FIRST for skill-specific queries (e.g. "Experience in Python", "Experience in SQL")
      if (profile.screening && window.NaukriMatcher) {
        const match = window.NaukriMatcher.findScreeningAnswer(label, profile.screening);
        if (match && match.answer) {
          valToSet = match.answer;
        }
      }

      // 2. Personal & Contact Details (Specific labels first!)
      if (!valToSet) {
        if (label.includes('first name')) valToSet = profile.personal?.firstName;
        else if (label.includes('last name')) valToSet = profile.personal?.lastName;
        else if (label.includes('candidate name') || label.includes('full name') || label.includes('your name') || label === 'name') valToSet = profile.personal?.fullName;
        else if (label.includes('email')) valToSet = profile.personal?.email;
        else if (label.includes('phone') || label.includes('mobile') || label.includes('contact')) valToSet = profile.personal?.phone;
        else if (label.includes('city') || label.includes('location')) valToSet = profile.personal?.city;

        // Work & Experience Details
        else if (label.includes('current title') || label.includes('designation') || label.includes('current role')) valToSet = profile.work?.currentRole?.jobTitle;
        else if (label.includes('company') || label.includes('employer') || label.includes('organization')) valToSet = profile.work?.currentRole?.company;
        else if (label.includes('total exp') || label.includes('years of exp') || label.includes('experience')) valToSet = profile.work?.currentRole?.yearsExperience;
        else if (label.includes('current ctc') || label.includes('current salary') || label.includes('fixed ctc')) valToSet = profile.work?.currentRole?.currentSalary;
        else if (label.includes('expected ctc') || label.includes('expected salary')) valToSet = profile.work?.targetRole?.expectedSalary;
        else if (label.includes('notice period') || label.includes('availability')) valToSet = profile.work?.targetRole?.noticePeriod;

        // Education Details
        else if (label.includes('degree') || label.includes('qualification')) valToSet = profile.education?.degree;
        else if (label.includes('university') || label.includes('college') || label.includes('institute')) valToSet = profile.education?.university;
        else if (label.includes('graduation') || label.includes('passing year')) valToSet = profile.education?.graduationYear;

      }

      if (valToSet) {
        // If numeric input expecting Lakhs (e.g. max <= 100 or placeholder indicates LPA)
        const isLpaInput = (el.max && parseFloat(el.max) <= 100) || label.includes('lacs') || label.includes('lpa') || label.includes('in lakh');
        if (isLpaInput && typeof valToSet === 'string' && parseFloat(valToSet) > 10000) {
          valToSet = (parseFloat(valToSet) / 100000).toFixed(1).replace(/\.0$/, '');
        }

        if (el.tagName.toLowerCase() === 'select') {
          for (const opt of el.options) {
            if (opt.textContent.toLowerCase().includes(String(valToSet).toLowerCase()) || opt.value.toLowerCase().includes(String(valToSet).toLowerCase())) {
              el.value = opt.value;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              autoSaveLearnedQA(label, opt.value, profile);
              filledCount++;
              break;
            }
          }
        } else {
          if (setReactInputValue(el, valToSet)) {
            autoSaveLearnedQA(label, valToSet, profile);
            filledCount++;
          }
        }
      }
    });

    return { filled: filledCount };
  }

  // Check if mandatory or screening questions remain unanswered in container
  function hasUnansweredQuestions(containerArg) {
    const container = containerArg || getActiveContainer();
    if (!container || container === document.body || container === document.documentElement) {
      return false;
    }

    // 1. Check for visible validation error messages inside container
    const errorEls = Array.from(container.querySelectorAll(
      '.errMsg, [class*="error" i], [class*="err-msg" i], [class*="validation" i], [class*="feedback-error" i]'
    )).filter(el => {
      if (el.offsetWidth === 0 || el.offsetHeight === 0) return false;
      const txt = (el.textContent || '').trim().toLowerCase();
      return (
        txt.includes('mandatory') ||
        txt.includes('required') ||
        txt.includes('please select') ||
        txt.includes('please enter') ||
        txt.includes('fill this') ||
        txt.includes('answer this') ||
        txt.includes('cannot be blank') ||
        txt.includes('cannot be empty')
      );
    });
    if (errorEls.length > 0) return true;

    // 2. Check for empty visible text/numeric/textarea inputs
    // In Naukri apply drawers, every question asked is required
    const textInputs = Array.from(container.querySelectorAll(
      'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([type="reset"]), textarea'
    )).filter(el => {
      if (el.offsetWidth === 0 || el.offsetHeight === 0 || el.disabled || el.readOnly) return false;
      if (el.id === 'naukri-btn-instant-apply' || el.closest('#naukri-auto-applier-pill') || el.closest('#naukri-standalone-auto-apply-btn')) return false;
      if (el.closest('header, nav, .search-box, form[name="searchForm"]')) return false;
      return (el.value || '').trim() === '';
    });
    if (textInputs.length > 0) return true;

    // Check if chatbot input is empty and waiting for response
    const chatInput = typeof container.querySelector === 'function' ? container.querySelector(
      'input[placeholder*="message" i], textarea[placeholder*="message" i], ' +
      'input[placeholder*="type" i], textarea[placeholder*="type" i], ' +
      'input[placeholder*="answer" i], textarea[placeholder*="answer" i], ' +
      'input[class*="chat" i], textarea[class*="chat" i], div[contenteditable="true"]'
    ) : null;
    if (chatInput && (chatInput.value || chatInput.innerText || '').trim() === '') {
      return true;
    }

    // 3. Check for unanswered radio groups (group with no radio checked)
    const radioGroups = {};
    const radios = Array.from(container.querySelectorAll('input[type="radio"]')).filter(r => {
      if (r.disabled) return false;
      return r.offsetWidth > 0 || r.offsetHeight > 0 || (r.parentElement && r.parentElement.offsetWidth > 0);
    });
    radios.forEach(r => {
      const groupName = r.name || (r.closest('.question-container, div[class*="question" i], fieldset, li') ? 'group_' + (r.closest('.question-container, div[class*="question" i], fieldset, li').innerText || '').slice(0, 30) : 'default');
      if (!radioGroups[groupName]) radioGroups[groupName] = [];
      radioGroups[groupName].push(r);
    });
    for (const group of Object.values(radioGroups)) {
      const hasChecked = group.some(r => r.checked);
      if (!hasChecked) return true;
    }

    // 4. Check for unanswered checkbox questions (e.g. multi-choice questions with checkboxes)
    const checkboxMap = new Map();
    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]')).filter(c => {
      if (c.disabled) return false;
      return c.offsetWidth > 0 || c.offsetHeight > 0 || (c.parentElement && c.parentElement.offsetWidth > 0);
    });
    for (const cb of checkboxes) {
      const parentQ = cb.closest('.question-container, div[class*="question" i], [role="group"], fieldset, li, ul, div[class*="field" i]');
      const groupKey = cb.name || (parentQ ? parentQ : cb.parentElement);
      if (!checkboxMap.has(groupKey)) checkboxMap.set(groupKey, []);
      checkboxMap.get(groupKey).push(cb);
    }
    for (const [groupKey, cbs] of checkboxMap.entries()) {
      if (cbs.length > 1) {
        const anyChecked = cbs.some(c => c.checked);
        if (!anyChecked) return true;
      } else if (cbs.length === 1) {
        const singleCb = cbs[0];
        const cbText = (singleCb.parentElement?.textContent || '').toLowerCase();
        if (singleCb.required || cbText.includes('mandatory') || cbText.includes('required') || singleCb.hasAttribute('aria-required')) {
          if (!singleCb.checked) return true;
        }
      }
    }

    // 5. Check question blocks for custom selectable options / chips / choices / list items
    const questionBlocks = Array.from(container.querySelectorAll(
      'fieldset, [role="radiogroup"], .question-container, div[class*="question" i], div[class*="Question" i], div[class*="radio-group" i], div[class*="form-group" i], div[class*="field" i], li'
    )).filter(q => q.offsetWidth > 0 && q.offsetHeight > 0);

    for (const block of questionBlocks) {
      const choices = extractChoicesFromScope(block);
      if (choices.length > 1) {
        const anySelected = choices.some(c => c.isChecked);
        if (!anySelected) return true;
      }
    }

    // 6. Check choices grouped by parent element (e.g. choice lists inside custom container)
    const allChoices = extractChoicesFromScope(container);
    if (allChoices.length > 1) {
      const choiceParentMap = new Map();
      for (const c of allChoices) {
        const parent = c.element.parentElement || container;
        if (!choiceParentMap.has(parent)) choiceParentMap.set(parent, []);
        choiceParentMap.get(parent).push(c);
      }
      for (const [parent, choicesInGroup] of choiceParentMap.entries()) {
        if (choicesInGroup.length > 1) {
          const anySelected = choicesInGroup.some(c => c.isChecked);
          if (!anySelected) return true;
        }
      }
      // If entire container choices have 0 selected, it is definitely unanswered
      const anyContainerSelected = allChoices.some(c => c.isChecked);
      if (!anyContainerSelected) return true;
    }

    // 7. Check for unselected dropdowns
    const selects = Array.from(container.querySelectorAll('select')).filter(s => s.offsetWidth > 0 && s.offsetHeight > 0 && !s.disabled);
    const unselectedSelects = selects.filter(s => s.selectedIndex <= 0 && (!s.value || s.value === '' || s.value === '0'));
    if (unselectedSelects.length > 0) return true;

    // 8. Check for custom dropdowns with unselected/placeholder text
    const customDropdowns = Array.from(container.querySelectorAll('[role="combobox"], .custom-select, div[class*="dropdown" i]')).filter(d => d.offsetWidth > 0 && d.offsetHeight > 0);
    for (const drop of customDropdowns) {
      const txt = (drop.textContent || '').toLowerCase();
      if (txt.includes('select') || txt.includes('choose')) {
        return true;
      }
    }

    return false;
  }

  // Advance or Submit with Button Discovery Hierarchy
  async function advanceOrSubmit(containerArg) {
    const container = containerArg || getActiveContainer();
    // ABSOLUTE RULE: NEVER advance or submit if no drawer is active or on document.body!
    if (!container || container === document.body || container === document.documentElement || container === document) {
      return { action: 'none' };
    }

    // STOP if mandatory questions are still unanswered - NEVER force submit!
    if (hasUnansweredQuestions(container)) {
      return { action: 'unresolved', reason: 'unanswered_questions' };
    }

    const buttons = Array.from(container.querySelectorAll(
      'button, a[role="button"], input[type="submit"], [role="button"], div[class*="btn" i], div[class*="button" i], [class*="apply-btn" i]'
    )).filter(b => {
      if (b.offsetWidth === 0 || b.offsetHeight === 0) return false;
      if (b.classList.contains('close') || b.getAttribute('aria-label') === 'Close' || b.closest('.crossIcon, [class*="close" i]')) return false;
      // NEVER re-click our floating pills
      if (b.id === 'naukri-btn-instant-apply' || b.closest('#naukri-auto-applier-pill') || b.closest('#naukri-standalone-auto-apply-btn')) return false;
      // ABSOLUTELY NEVER click background page apply button or job header during advanceOrSubmit!
      if (b.id === 'apply-button' || b.classList.contains('apply-button')) return false;
      if (b.closest('#job_header, .styles_job-header-container___0wLZ, [class*="job-header"], [class*="apply-button-container"], .styles_jhc__apply-button-container__5Bqnb')) return false;
      return true;
    });

    // 1. Check for Submit button FIRST
    const submitBtn = buttons.find(b => {
      const text = (b.textContent || b.value || '').toLowerCase().trim();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase().trim();
      const id = (b.id || '').toLowerCase();
      const cl = (b.className || '').toLowerCase();
      return (
        text === 'apply' ||
        text === 'apply now' ||
        text === 'submit application' ||
        text === 'submit' ||
        text === 'submit your application' ||
        text === 'save & apply' ||
        text === 'save and apply' ||
        text === 'send application' ||
        text === 'i am interested' ||
        text === 'i\'m interested' ||
        text === 'confirm & apply' ||
        text === 'confirm' ||
        text === 'done' ||
        aria.includes('submit') ||
        id.includes('submit') ||
        cl.includes('submit') ||
        cl.includes('apply-btn') ||
        cl.includes('drawer-apply')
      );
    });

    if (submitBtn) {
      if (hasUnansweredQuestions(container)) {
        return { action: 'unresolved', reason: 'unanswered_questions' };
      }
      let attempts = 0;
      while ((submitBtn.disabled || submitBtn.getAttribute('aria-disabled') === 'true' || submitBtn.classList.contains('disabled')) && attempts < 10) {
        await new Promise(r => setTimeout(r, 200));
        attempts++;
      }
      if (hasUnansweredQuestions(container) || submitBtn.disabled || submitBtn.getAttribute('aria-disabled') === 'true' || submitBtn.classList.contains('disabled')) {
        return { action: 'unresolved', reason: 'unanswered_questions' };
      }
      triggerHumanClick(submitBtn);
      return { action: 'submitted', button: submitBtn };
    }

    // 2. Check for Continue / Next / Review / Save & Next button
    const continueBtn = buttons.find(b => {
      const text = (b.textContent || b.value || '').toLowerCase().trim();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase().trim();
      return (
        text === 'continue' ||
        text === 'next' ||
        text === 'review' ||
        text.includes('proceed') ||
        text.includes('save & next') ||
        text.includes('save and next') ||
        aria.includes('next') ||
        aria.includes('continue')
      );
    });

    if (continueBtn) {
      let attempts = 0;
      while ((continueBtn.disabled || continueBtn.getAttribute('aria-disabled') === 'true' || continueBtn.classList.contains('disabled')) && attempts < 10) {
        await new Promise(r => setTimeout(r, 200));
        attempts++;
      }
      
      triggerHumanClick(continueBtn);
      return { action: 'advanced', button: continueBtn };
    }

    // 3. Fallback: Drawer Footer Primary Action Button
    const drawerActionBtn = buttons.find(b => {
      const isFooterOrBottom = b.closest('[class*="footer" i], [class*="bottom" i], [class*="action" i], [class*="drawer" i], [class*="chatbot" i]');
      const isPrimary = b.className.toLowerCase().includes('primary') || b.className.toLowerCase().includes('btn') || b.tagName === 'BUTTON';
      return isFooterOrBottom && isPrimary;
    });

    if (drawerActionBtn) {
      if (hasUnansweredQuestions(container)) {
        return { action: 'unresolved', reason: 'unanswered_questions' };
      }
      let attempts = 0;
      while ((drawerActionBtn.disabled || drawerActionBtn.getAttribute('aria-disabled') === 'true' || drawerActionBtn.classList.contains('disabled')) && attempts < 10) {
        await new Promise(r => setTimeout(r, 200));
        attempts++;
      }
      if (hasUnansweredQuestions(container)) { return { action: "unresolved", reason: "unanswered_questions" }; }
      triggerHumanClick(drawerActionBtn);
      return { action: 'submitted', button: drawerActionBtn };
    }

    return { action: 'none' };
  }

  // Check if application is already submitted
  function isApplicationSubmitted(containerArg) {
    const scope = containerArg || document;
    const bodyText = (scope.textContent || '').toLowerCase();

    // Rejection / error checks (DO NOT treat rejection as submitted)
    if (
      bodyText.includes('your application was not accepted') ||
      bodyText.includes('application was not accepted') ||
      bodyText.includes('please answer all mandatory questions') ||
      bodyText.includes('due to incomplete information')
    ) {
      return false;
    }

    if (
      bodyText.includes('applied successfully') ||
      bodyText.includes('application sent') ||
      bodyText.includes('successfully applied') ||
      bodyText.includes('you have applied to this job') ||
      bodyText.includes('application submitted') ||
      bodyText.includes('thank you for applying') ||
      Boolean(scope.querySelector('.apply-success, [class*="success-msg"], [class*="applied-msg"], .msg-success, [class*="toast-success"], [class*="successToast"]'))
    ) {
      return true;
    }

    // Check if detail page Apply button has transitioned to "Applied"
    const applyBtn = document.getElementById('apply-button') ||
                     document.querySelector('button.apply-button, [class*="apply-button"]');
    if (applyBtn) {
      const txt = (applyBtn.textContent || applyBtn.value || '').trim().toLowerCase();
      if (txt === 'applied' || txt === 'already applied' || (applyBtn.disabled && txt.includes('applied'))) {
        return true;
      }
    }

    return false;
  }

  // Check for genuine active visible CAPTCHA challenge
  function checkCaptcha() {
    // 1. Check for active Google reCAPTCHA challenge modal (the interactive image puzzle bframe)
    const bframe = document.querySelector('iframe[src*="recaptcha/api2/bframe"], iframe[title*="recaptcha challenge" i]');
    if (bframe && bframe.offsetWidth > 50 && bframe.offsetHeight > 50) {
      try {
        const style = window.getComputedStyle(bframe);
        if (style.visibility !== 'hidden' && style.display !== 'none' && parseFloat(style.opacity || '1') > 0) {
          return true;
        }
      } catch (_) {}
    }

    // 2. Check for interactive reCAPTCHA checkbox (excluding invisible badges)
    const anchor = document.querySelector('iframe[src*="recaptcha/api2/anchor" i], iframe[title*="reCAPTCHA" i]');
    if (anchor && !anchor.closest('.grecaptcha-badge')) {
      if (anchor.offsetWidth > 100 && anchor.offsetHeight > 40) {
        if (anchor.getAttribute('aria-checked') !== 'true') {
          try {
            const style = window.getComputedStyle(anchor);
            if (style.visibility !== 'hidden' && style.display !== 'none') {
              return true;
            }
          } catch (_) {}
        }
      }
    }

    // 3. Check for Cloudflare Turnstile / Geetest visible challenge
    const cfTurnstile = document.querySelector('.cf-turnstile:not([style*="display: none"]), iframe[src*="challenges.cloudflare.com"]');
    if (cfTurnstile && cfTurnstile.offsetWidth > 50) {
      return true;
    }

    // 4. Check for explicit verification text inside the active application container ONLY (not page footer)
    const container = getActiveContainer();
    if (container && container !== document.body) {
      const containerText = (container.innerText || '').toLowerCase();
      if (
        containerText.includes("i'm not a robot") ||
        containerText.includes("please verify that you are human") ||
        containerText.includes("complete the security check") ||
        containerText.includes("security verification required")
      ) {
        return true;
      }
    }

    return false;
  }

  // Close drawer or modal
  function closeModal(containerArg) {
    const scope = containerArg || getActiveContainer() || document;
    const closeBtn = scope.querySelector('.crossIcon, .drawer-close, button.close, [aria-label="Close"], .icon-close, [class*="close-btn"], .naukicon.cross, i.cross');
    if (closeBtn) {
      triggerHumanClick(closeBtn);
    }
  }

  // Automatically learn from manual user inputs so future jobs answer automatically
  function attachManualAnswerLearning() {
    if (typeof window === 'undefined' || typeof document === 'undefined' || !document.addEventListener || window._naukriLearningAttached) return;
    window._naukriLearningAttached = true;

    document.addEventListener('change', async (e) => {
      const target = e.target;
      if (!target || !target.closest) return;
      const drawer = target.closest(CONTAINER_SELECTORS.join(', '));
      if (!drawer) return;

      const qContainer = target.closest('.question-container, div[class*="question" i], div[class*="field" i], li, fieldset');
      if (!qContainer) return;

      const labelEl = qContainer.querySelector('label, [class*="label" i], [class*="title" i], [class*="heading" i], legend, p, span');
      const qText = labelEl ? (labelEl.textContent || '').trim() : (target.getAttribute('aria-label') || target.placeholder || '');
      if (!qText) return;

      let answer = '';
      if (target.type === 'radio' || target.type === 'checkbox') {
        const optionLabel = target.closest('label') || target.parentElement;
        answer = (optionLabel ? optionLabel.textContent : target.value || '').trim();
      } else if (target.tagName && target.tagName.toLowerCase() === 'select') {
        answer = target.options[target.selectedIndex]?.text || target.value;
      } else {
        answer = target.value;
      }

      if (qText && answer) {
        try {
          const { userProfile } = await chrome.storage.local.get('userProfile');
          if (userProfile) {
            autoSaveLearnedQA(qText, answer, userProfile);
          }
        } catch (_) {}
      }
    }, true);
  }

  attachManualAnswerLearning();

  const NaukriFormFiller = {
    getActiveContainer,
    fillCurrentStep,
    advanceOrSubmit,
    hasUnansweredQuestions,
    isApplicationSubmitted,
    checkCaptcha,
    closeModal,
    triggerHumanClick,
    handleScreeningChoices,
    evaluateBestChoice,
    handleCustomDropdowns,
    handleChatbotStep,
    autoSaveLearnedQA
  };

  if (typeof window !== 'undefined') {
    window.NaukriFormFiller = NaukriFormFiller;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NaukriFormFiller;
  }
})();
