/**
 * Naukri Automated Job Application - Matcher & Heuristics Engine
 * High-speed fuzzy screening Q&A matcher, multi-tier filter rules,
 * recruiter contact extractor (Phone, Gmail, Email), experience and salary parser.
 */

(function () {
  const STOPWORDS = new Set([
    'what', 'your', 'with', 'have', 'from', 'this', 'that', 'rate',
    'how', 'are', 'you', 'the', 'for', 'any', 'please', 'mention',
    'select', 'enter', 'give', 'tell', 'us', 'specify', 'do', 'does'
  ]);

  function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Normalize unicode dashes (e.g. – — −)
  function normalizeText(str) {
    if (!str) return '';
    return String(str)
      .replace(/[\u2010-\u2015\u2212\u2013\u2014]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ============================================================================
  // 1. RECRUITER CONTACT EXTRACTOR (Phone, Mobile, Gmail, Corporate Email)
  // ============================================================================
  function extractRecruiterContact(text) {
    if (!text || typeof text !== 'string') {
      return { hasContact: false, emails: [], phones: [], primaryEmail: null, primaryPhone: null, isGmail: false, summary: '' };
    }

    const clean = normalizeText(text);

    // 1. Extract Email addresses
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    const rawEmails = clean.match(emailRegex) || [];
    // Filter out common false positives (e.g. image filenames, sdk examples)
    const ignoredEmailDomains = ['example.com', 'sample.com', 'domain.com', 'email.com', 'naukri.com', 'infoedge.in'];
    const emails = Array.from(new Set(rawEmails.map(e => e.trim().toLowerCase()))).filter(e => {
      const domain = e.split('@')[1];
      return domain && !ignoredEmailDomains.includes(domain) && !e.endsWith('.png') && !e.endsWith('.jpg');
    });

    // 2. Extract Indian mobile numbers and contact phone numbers
    // Matches +91 9876543210, 09876543210, 9876543210, 88888 88888, WhatsApp: 9876543210
    const phoneMatches = [];

    // Contextual patterns (call, contact, whatsapp, reach, mobile, ph, hr)
    const contextPhoneRegex = /(?:whatsapp|wa\.me|contact|call|reach|phone|ph|mobile|hr|hiring manager|send resume to)?\s*[:\-]?\s*(?:\+91[\-\s]?)?([6-9]\d{4}[\-\s]?\d{5}|[6-9]\d{9})\b/gi;
    let match;
    while ((match = contextPhoneRegex.exec(clean)) !== null) {
      if (match[1]) {
        const rawDigits = match[1].replace(/[\-\s]/g, '');
        if (rawDigits.length === 10 && /^[6-9]/.test(rawDigits)) {
          phoneMatches.push(rawDigits);
        }
      }
    }

    // Direct standalone 10-digit Indian mobile regex
    const mobileRegex = /(?:\+?91[\-\s]?)?\b([6-9]\d{9})\b/g;
    while ((match = mobileRegex.exec(clean)) !== null) {
      if (match[1]) {
        phoneMatches.push(match[1]);
      }
    }

    const phones = Array.from(new Set(phoneMatches));
    const isGmail = emails.some(e => e.endsWith('@gmail.com'));
    const hasContact = emails.length > 0 || phones.length > 0;

    const primaryEmail = emails[0] || null;
    const primaryPhone = phones[0] || null;

    let summaryParts = [];
    if (primaryEmail) summaryParts.push(primaryEmail);
    if (primaryPhone) summaryParts.push(`+91 ${primaryPhone}`);
    const summary = summaryParts.join(' | ');

    return {
      hasContact,
      emails,
      phones,
      primaryEmail,
      primaryPhone,
      isGmail,
      summary
    };
  }

  // ============================================================================
  // 2. FUZZY SCREENING Q&A MATCHER & NORMALIZERS
  // ============================================================================
  function findScreeningAnswer(labelText, screeningBank) {
    if (!labelText || !Array.isArray(screeningBank)) return null;

    const cleanLabel = labelText.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

    for (const item of screeningBank) {
      if (!item.keywords || !item.answer) continue;
      const rawKeys = item.keywords.toLowerCase().split(/[,/|]/).map(k => k.trim());

      for (const rawKey of rawKeys) {
        const key = rawKey.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
        if (!key) continue;

        // Strategy 1: Direct Phrase Containment
        if (cleanLabel.includes(key) || key.includes(cleanLabel)) {
          return { answer: item.answer, confidence: 0.95, matchedKey: key };
        }

        // Strategy 2: Multi-Token Overlap
        const keyTokens = key.split(' ').filter(t => t.length > 2 && !STOPWORDS.has(t));
        if (keyTokens.length > 0 && keyTokens.every(tok => cleanLabel.includes(tok))) {
          return { answer: item.answer, confidence: 0.90, matchedKey: key };
        }
      }
    }

    return null;
  }

  function normalizeDegreeCategory(str) {
    if (!str) return null;
    const clean = String(str).toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

    if (/\b(master|masters|m\s*tech|mtech|mca|mba|ms|postgraduate)\b/i.test(clean)) return 'master';
    if (/\b(doctorate|ph\s*d|phd)\b/i.test(clean)) return 'doctorate';
    if (/\b(bachelor|bachelors|b\s*tech|btech|bca|b\s*e|be|bsc|bcom|graduation|graduate)\b/i.test(clean)) return 'bachelor';
    if (/\b(12th|10th|high\s*school|diploma|secondary)\b/i.test(clean)) return 'highschool';
    return null;
  }

  function normalizeNoticePeriod(str) {
    if (!str) return null;
    const clean = String(str).toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

    if (/\b(immediate|immediately|available\s*now|serving\s*notice|0\s*days?)\b/i.test(clean)) return 'immediate';
    if (/\b(15\s*days?|2\s*weeks?)\b/i.test(clean)) return '15days';
    if (/\b(30\s*days?|1\s*months?|4\s*weeks?)\b/i.test(clean)) return '30days';
    if (/\b(60\s*days?|2\s*months?)\b/i.test(clean)) return '60days';
    if (/\b(90\s*days?|3\s*months?)\b/i.test(clean)) return '90days';
    return null;
  }

  // ============================================================================
  // 3. MULTI-TIER HEURISTIC FILTERS
  // ============================================================================

  // AI Gig, Micro-Task & Annotation Spam Shield
  const SPAM_COMPANIES = [
    'crossing hurdles', 'outlier', 'remotasks', 'dataannotation', 'alignerr',
    'mindrift', 'oneforma', 'invisible technologies', 'appen', 'telus international',
    'welocalize', 'clickworker', 'toloka'
  ];

  const GIG_TITLE_KEYWORDS = [
    'annotator', 'annotation', 'data annotator', 'data reviewer', 'ai reviewer',
    'content reviewer', 'data labeler', 'data labeling', 'ai trainer', 'model trainer',
    'data trainer', 'rlhf', 'prompt evaluator', 'ai evaluator', 'transcriptionist',
    'data entry', 'form filling', 'crowdworker', 'micro task', 'microtask'
  ];

  function isAiGigSpam(title = '', company = '', text = '') {
    const tLower = title.toLowerCase();
    const cLower = company.toLowerCase();
    const full = `${title} ${text}`.toLowerCase();

    // Check spam companies
    if (SPAM_COMPANIES.some(sc => cLower.includes(sc) || tLower.includes(sc))) {
      return { isSpam: true, reason: 'Known AI annotation/gig platform' };
    }

    // Check gig titles
    if (GIG_TITLE_KEYWORDS.some(k => tLower.includes(k))) {
      return { isSpam: true, reason: 'AI annotation/gig job title' };
    }

    // Check hourly dollar rate in Indian job postings
    if (/\$\s*\d+(?:\.\d+)?\s*(?:\/|\s*per\s*)h(?:ou)?r/i.test(full)) {
      return { isSpam: true, reason: 'Hourly USD rate gig posting' };
    }

    return { isSpam: false };
  }

  // Strict Job Title Relevance Filter
  function checkTitleRelevance(jobTitle, targetQuery) {
    if (!targetQuery || !jobTitle) return true;
    const target = targetQuery.toLowerCase().trim();
    const title = jobTitle.toLowerCase();

    // Role family: Analyst / Analytics / BI / MIS
    if (target.includes('analyst') || target.includes('analytics') || target.includes('mis')) {
      return /\b(analyst|analytics|analysis|bi\b|business intelligence|reporting|insights|mis\b|data)/i.test(title);
    }

    // Role family: Software / Developer / Engineer
    if (target.includes('developer') || target.includes('engineer') || target.includes('software')) {
      return /\b(developer|engineer|software|programmer|sde|frontend|backend|fullstack|full\s*stack|web)\b/i.test(title);
    }

    // Generic token overlap excluding filler
    const tokens = target.split(/[\s,]+/).map(t => t.replace(/[^a-z0-9]/g, '')).filter(t => t.length > 2 && !STOPWORDS.has(t));
    if (tokens.length === 0) return true;
    return tokens.some(t => title.includes(t));
  }

  // Negative Keywords Blacklist (Strict Word Boundaries & Dash Normalization)
  function isBlacklisted(text, blacklistStr) {
    if (!text || !blacklistStr) return false;
    const normalized = normalizeText(text).toLowerCase();

    const tokens = blacklistStr
      .split(/[,;]/)
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0);

    return tokens.some(token => {
      let regex;
      if (token === 'intern') {
        regex = /\b(?:intern|interns|internship|internships)\b/i;
      } else {
        regex = new RegExp(`\\b${escapeRegex(token)}\\b`, 'i');
      }
      return regex.test(normalized);
    });
  }

  // Blocked Companies / Consultancies Filter
  function isCompanyBlocked(companyName, blockedStr) {
    if (!companyName || !blockedStr) return false;
    const cLower = companyName.toLowerCase().trim();

    const blockedList = blockedStr
      .split(/[,;]/)
      .map(b => b.trim().toLowerCase())
      .filter(b => b.length > 0);

    return blockedList.some(b => cLower.includes(b));
  }

  // Strict Location Filter & Regional Aliases
  function checkLocationMatch(jobLocation, targetLocation) {
    if (!targetLocation) return true;
    const target = targetLocation.toLowerCase().trim();
    const loc = (jobLocation || '').toLowerCase().trim();

    // 1. Countrywide India
    if (target === 'india' || target === 'all india' || target.includes('all india')) {
      return true;
    }

    // 2. Remote / Hybrid matching
    if (target.includes('remote') && (loc.includes('remote') || loc.includes('work from home') || loc.includes('wfh'))) {
      return true;
    }

    // 3. Delhi NCR Aliases
    const ncrAliases = ['delhi', 'new delhi', 'ncr', 'gurgaon', 'gurugram', 'noida', 'greater noida', 'faridabad', 'ghaziabad'];
    if (ncrAliases.some(alias => target.includes(alias))) {
      return ncrAliases.some(alias => loc.includes(alias)) || loc.includes('remote');
    }

    // 4. Bengaluru / Bangalore
    if (target.includes('bangalore') || target.includes('bengaluru')) {
      return loc.includes('bangalore') || loc.includes('bengaluru') || loc.includes('remote');
    }

    // 5. Mumbai Metropolitan
    if (target.includes('mumbai') || target.includes('navi mumbai') || target.includes('thane')) {
      return loc.includes('mumbai') || loc.includes('navi mumbai') || loc.includes('thane') || loc.includes('remote');
    }

    // 6. Hyderabad / Secunderabad
    if (target.includes('hyderabad') || target.includes('secunderabad')) {
      return loc.includes('hyderabad') || loc.includes('secunderabad') || loc.includes('remote');
    }

    // 7. Direct containment
    const cleanTargetTokens = target.split(/[\s,]+/).filter(t => t.length > 2);
    return cleanTargetTokens.some(t => loc.includes(t)) || loc.includes('remote') || loc.includes('work from home');
  }

  // ============================================================================
  // 4. EXPERIENCE REQUIREMENT PARSER
  // ============================================================================
  function parseExperienceRequirement(title = '', description = '', badge = '') {
    const fullText = normalizeText(`${title} \n ${badge} \n ${description}`).toLowerCase();

    // 1. Fresher / 0 years indicators
    if (/\b(fresher|entry level|intern|trainee|0\s*-\s*1\s*(?:years?|yrs?)|0\s*-\s*2\s*(?:years?|yrs?)|no experience required|freshers(?:\s+are)?\s+welcome)\b/i.test(fullText)) {
      return 0;
    }

    // 2. Explicit patterns for required experience
    const expPatterns = [
      /(?:experience|exp)\s*(?:required|needed|mandatory)?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:to|-|\+)?\s*(\d+(?:\.\d+)?)?\s*(?:years?|yrs?)/i,
      /(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)(?:\s+(?:of\s+)?(?:relevant\s+)?experience)?/i,
      /(\d+(?:\.\d+)?)\s*\+\s*(?:years?|yrs?)(?:\s+(?:of\s+)?(?:relevant\s+)?experience)/i,
      /(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\s+(?:of\s+)?(?:relevant\s+)?experience/i,
      /minimum\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/i,
      /at least\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/i,
      /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*yrs/i,
      /(\d+(?:\.\d+)?)\s*yrs/i
    ];

    for (const pat of expPatterns) {
      const match = fullText.match(pat);
      if (match && match[1]) {
        const val = parseFloat(match[1]);
        if (!isNaN(val) && val >= 0 && val <= 30) {
          return val;
        }
      }
    }

    // 3. Senior role title hints
    if (/\b(senior|sr\.|lead|manager|principal|architect|director|head of)\b/i.test(title)) {
      if (!/\b(executive|assistant|junior|jr\.|trainee|associate)\b/i.test(title)) {
        return 4;
      }
    }

    return null; // Unlisted
  }

  // ============================================================================
  // 5. SALARY PARSER (INR, LPA & Monthly)
  // ============================================================================
  function parseMonthlySalary(salaryStr) {
    if (!salaryStr) return null;
    const lower = salaryStr.toLowerCase().replace(/,/g, '');

    // 1. LPA / Lacs format (Naukri standard: "3-6 Lacs PA", "4.5 - 7.5 LPA", "50,000 - 3 Lacs PA")
    if (lower.includes('lac') || lower.includes('lakh') || lower.includes('lpa')) {
      const nums = lower.match(/\d+(?:\.\d+)?/g);
      if (nums && nums.length > 0) {
        const lpaVals = nums.map(n => parseFloat(n)).filter(n => !isNaN(n) && n > 0 && n < 100);
        if (lpaVals.length > 0) {
          const monthlyVals = lpaVals.map(lpa => Math.round((lpa * 100000) / 12));
          return {
            minMonthly: Math.min(...monthlyVals),
            maxMonthly: Math.max(...monthlyVals),
            isLpa: true
          };
        }
      }
    }

    // 2. Direct INR / ₹ / Monthly numbers
    if (lower.includes('₹') || lower.includes('inr') || lower.includes('rs') || lower.includes('per month')) {
      const nums = lower.match(/\d+/g);
      if (nums && nums.length > 0) {
        const parsedVals = nums.map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n > 100);
        if (parsedVals.length > 0) {
          const toMonthly = (val) => {
            if (lower.includes('year') || lower.includes('annum') || val > 80000) {
              return Math.round(val / 12);
            }
            if (lower.includes('month') || lower.includes('pm')) {
              return val;
            }
            return val;
          };
          const monthlyVals = parsedVals.map(toMonthly);
          return {
            minMonthly: Math.min(...monthlyVals),
            maxMonthly: Math.max(...monthlyVals),
            isLpa: false
          };
        }
      }
    }

    return null;
  }

  // ============================================================================
  // 6. POST AGE / FRESHNESS PARSER
  // ============================================================================
  function parseJobAgeDays(text) {
    if (!text || typeof text !== 'string') return null;
    const lower = text.toLowerCase().trim();

    // 1. Immediate / Today / Hours
    if (
      lower.includes('just now') ||
      lower.includes('today') ||
      lower.includes('few hours') ||
      lower.includes('hour ago') ||
      lower.includes('hours ago') ||
      lower.includes('mins ago') ||
      lower.includes('minutes ago')
    ) {
      return 0;
    }

    // 2. Day(s) ago: "1 Day Ago", "3 Days Ago", "30+ Days Ago"
    if (lower.includes('30+ day') || lower.includes('30+ days') || lower.includes('> 30 days')) {
      return 31;
    }

    const dayMatch = lower.match(/(\d+)\s*\+?\s*days?\s*ago/);
    if (dayMatch && dayMatch[1]) {
      const d = parseInt(dayMatch[1], 10);
      if (!isNaN(d)) return d;
    }

    // 3. Month(s) ago
    const monthMatch = lower.match(/(\d+)\s*months?\s*ago/);
    if (monthMatch && monthMatch[1]) {
      const m = parseInt(monthMatch[1], 10);
      if (!isNaN(m)) return m * 30;
    }

    return null;
  }

  // Export to window / module
  const NaukriMatcher = {
    findScreeningAnswer,
    normalizeDegreeCategory,
    normalizeNoticePeriod,
    extractRecruiterContact,
    isAiGigSpam,
    checkTitleRelevance,
    isBlacklisted,
    isCompanyBlocked,
    checkLocationMatch,
    parseExperienceRequirement,
    parseMonthlySalary,
    parseJobAgeDays,
    normalizeText
  };

  if (typeof window !== 'undefined') {
    window.NaukriMatcher = NaukriMatcher;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NaukriMatcher;
  }
})();
