// Wuzzuf Jobs Scraper - High-performance implementation with JSON API priority
import { Actor, log } from 'apify';
import { CheerioCrawler, Dataset } from 'crawlee';
import { load as cheerioLoad } from 'cheerio';
import { gotScraping } from 'got-scraping';

await Actor.init();

async function main() {
    try {
        const input = (await Actor.getInput()) || {};
        const {
            keyword = '',
            location = '',
            category = '',
            careerLevel = '',
            jobType = '',
            maxJobAge = 'all',
            results_wanted: RESULTS_WANTED_RAW = 100,
            max_pages: MAX_PAGES_RAW = 20,
            collectDetails = true,
            startUrl,
            startUrls,
            url,
            proxyConfiguration,
        } = input;

        const RESULTS_WANTED = Number.isFinite(+RESULTS_WANTED_RAW) ? Math.max(1, +RESULTS_WANTED_RAW) : 100;
        const MAX_PAGES = Number.isFinite(+MAX_PAGES_RAW) ? Math.max(1, +MAX_PAGES_RAW) : 20;
        const BASE_URL = 'https://wuzzuf.net';

        const toAbs = (href, base = BASE_URL) => {
            try {
                return new URL(href, base).href;
            } catch {
                return null;
            }
        };

        const normalizeUrl = (rawUrl, base = BASE_URL) => {
            if (!rawUrl) return null;
            const trimmed = String(rawUrl).trim().replace(/&amp;/g, '&');
            if (!trimmed || trimmed.startsWith('data:')) return null;
            try {
                const u = new URL(trimmed, base);
                u.search = '';
                u.hash = '';
                return u.href;
            } catch {
                return null;
            }
        };

        const normalizeLocation = (rawLocation) => {
            if (!rawLocation) return null;
            const cleaned = String(rawLocation)
                .replace(/\s+/g, ' ')
                .replace(/\s*[|•]\s*/g, ', ')
                .replace(/\s*,\s*/g, ', ')
                .trim();
            return cleaned || null;
        };

        const extractLocationFromMeta = ($) => {
            const locality = $('meta[property="og:locality"]').attr('content')?.trim();
            const region = $('meta[property="og:region"]').attr('content')?.trim();
            const country = (
                $('meta[property="og:country-name"]').attr('content') ||
                $('meta[property="og:country_name"]').attr('content') ||
                $('meta[property="og:country"]').attr('content')
            )?.trim();

            const parts = [locality, region, country].map(normalizeLocation).filter(Boolean);
            const deduped = [];
            for (const part of parts) {
                if (!deduped.some((p) => p.toLowerCase() === part.toLowerCase())) deduped.push(part);
            }
            return deduped.length ? deduped.join(', ') : null;
        };

        const extractLocationFromTitle = ($) => {
            const titleText = $('title').first().text().replace(/\s+/g, ' ').trim();
            if (!titleText) return null;
            const m = titleText.match(/\s+in\s+(.+?)\s*(?:-|–|—)\s*Apply\b/i);
            return m?.[1] ? normalizeLocation(m[1]) : null;
        };

        const cleanText = (html) => {
            if (!html) return '';
            const $ = cheerioLoad(html);
            $('script, style, noscript, iframe').remove();
            return $.root().text().replace(/\s+/g, ' ').trim();
        };

        const sanitizeText = (text) => {
            if (!text) return null;

            // Aggressive cleaning for CSS artifacts and code
            let cleaned = text
                // Remove CSS class patterns
                .replace(/\.?css-[a-z0-9]+\s*\{[^}]*\}/gi, '')
                .replace(/css-[a-z0-9]+/gi, '')
                // Remove style/script content
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                // Remove object artifacts
                .replace(/\[object\s+Object\]/gi, '')
                // Remove HTML tags
                .replace(/<[^>]*>/g, '')
                // Remove CSS properties patterns
                .replace(/\{[^}]*:[^}]*\}/g, '')
                .replace(/\.?\{[^}]*\}/g, '')
                // Remove data attributes
                .replace(/data-[a-z-]+=\"[^"]*\"/gi, '')
                // Normalize whitespace
                .replace(/\s+/g, ' ')
                .replace(/\u00a0/g, ' ')
                .replace(/&nbsp;/g, ' ')
                .replace(/&#x[0-9A-F]+;/gi, ' ') // Remove HTML entities
                .replace(/&[a-z]+;/gi, ' ')
                // Remove common CSS artifacts
                .replace(/height:|width:|margin:|padding:|flex:|display:/gi, '')
                .replace(/object-fit:|object-position:/gi, '')
                .replace(/-webkit-|-ms-|-moz-/gi, '')
                .trim();

            // Return null if result is empty or looks like CSS code
            if (!cleaned ||
                cleaned.length === 0 ||
                cleaned.startsWith('.') ||
                cleaned.startsWith('#') ||
                cleaned.includes('{') ||
                cleaned.includes('}') ||
                /^[.#][\w-]+$/.test(cleaned) ||
                /^\d+px/.test(cleaned)) {
                return null;
            }

            return cleaned;
        };

        const isValidText = (text) => {
            if (!text) return false;
            const lowerText = text.toLowerCase();
            // Check if text contains CSS artifacts or web/styling keywords
            const cssArtifacts = ['css-', 'webkit', '-moz-', '-ms-', '-o-',
                'flex', 'display:', 'inline', 'margin', 'padding', 'height:', 'width:',
                'position:', 'absolute', 'relative', 'fixed', 'color:', 'background',
                'font-', 'border', 'overflow', 'transform', 'transition', 'animation',
                'object-fit', 'object-position', 'justify-content', 'align-items',
                'grid', 'block', 'none', 'auto', 'inherit', 'initial', 'unset',
                'px', 'em', 'rem', 'vh', 'vw', '%', 'rgb', 'rgba', 'hsl', 'hsla', '#'];

            // Check for CSS patterns
            if (cssArtifacts.some(artifact => lowerText.includes(artifact))) {
                return false;
            }

            // Additional checks for CSS-like patterns
            return !text.includes('{') &&
                !text.includes('}') &&
                !text.includes(':') &&  // CSS property patterns
                !text.includes(';') &&  // CSS statement endings
                !text.startsWith('.') &&
                !text.startsWith('#') &&
                !/^\d+$/.test(text) &&  // Pure numbers
                text.length > 1;
        };

        const isJobWithinAgeLimit = (datePosted, maxAge) => {
            if (maxAge === 'all') return true;

            if (!datePosted) return false;

            const now = new Date();
            let jobDate;

            // Parse Wuzzuf date formats like "3 hours ago", "2 days ago", "1 week ago", etc.
            const timeMatch = datePosted.match(/(\d+)\s*(hour|day|week|month)s?\s*ago/i);
            if (timeMatch) {
                const [, amount, unit] = timeMatch;
                const numAmount = parseInt(amount);

                jobDate = new Date(now);
                switch (unit.toLowerCase()) {
                    case 'hour':
                        jobDate.setHours(now.getHours() - numAmount);
                        break;
                    case 'day':
                        jobDate.setDate(now.getDate() - numAmount);
                        break;
                    case 'week':
                        jobDate.setDate(now.getDate() - (numAmount * 7));
                        break;
                    case 'month':
                        jobDate.setMonth(now.getMonth() - numAmount);
                        break;
                }
            } else {
                // Try to parse as absolute date
                jobDate = new Date(datePosted);
                if (isNaN(jobDate.getTime())) return false;
            }

            const ageInDays = (now - jobDate) / (1000 * 60 * 60 * 24);

            switch (maxAge) {
                case '7 days':
                    return ageInDays <= 7;
                case '30 days':
                    return ageInDays <= 30;
                case '90 days':
                    return ageInDays <= 90;
                default:
                    return true;
            }
        };

        const buildStartUrl = (kw, loc, cat, level, type) => {
            const u = new URL(`${BASE_URL}/search/jobs/`);
            const params = [];
            if (kw) params.push(`q=${encodeURIComponent(String(kw).trim())}`);
            if (loc) params.push(`a0=Location&l0=0&l1=2&l2=4&filters[location][0]=${encodeURIComponent(String(loc).trim())}`);
            if (cat) params.push(`filters[categories][0]=${encodeURIComponent(String(cat).trim())}`);
            if (level) params.push(`filters[career_level][0]=${encodeURIComponent(String(level).trim())}`);
            if (type) params.push(`filters[job_type][0]=${encodeURIComponent(String(type).trim())}`);

            return params.length ? `${u.href}?${params.join('&')}` : u.href;
        };

        const initial = [];
        if (Array.isArray(startUrls) && startUrls.length) initial.push(...startUrls);
        if (startUrl) initial.push(startUrl);
        if (url) initial.push(url);
        if (!initial.length) initial.push(buildStartUrl(keyword, location, category, careerLevel, jobType));

        const proxyConf = proxyConfiguration
            ? await Actor.createProxyConfiguration({ ...proxyConfiguration })
            : undefined;

        let saved = 0;
        const processedUrls = new Set();

        // Try to fetch JSON API data first (priority approach)
        async function tryJsonApi(searchUrl, pageNo = 0) {
            try {
                log.info(`Attempting JSON API for page ${pageNo + 1}`);
                const response = await gotScraping({
                    url: searchUrl,
                    headers: {
                        'Accept': 'application/json, text/javascript, */*; q=0.01',
                        'X-Requested-With': 'XMLHttpRequest',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    },
                    proxyUrl: proxyConf ? await proxyConf.newUrl() : undefined,
                    responseType: 'json',
                });

                if (response.body && typeof response.body === 'object') {
                    log.info('Successfully retrieved JSON API data');
                    return response.body;
                }
            } catch (err) {
                log.warning(`JSON API failed: ${err.message}, falling back to HTML parsing`);
            }
            return null;
        }

        function extractFromJsonLd($) {
            const scripts = $('script[type="application/ld+json"]');
            for (let i = 0; i < scripts.length; i++) {
                try {
                    const parsed = JSON.parse($(scripts[i]).html() || '');
                    const arr = Array.isArray(parsed) ? parsed : [parsed];
                    for (const e of arr) {
                        if (!e) continue;
                        const t = e['@type'] || e.type;
                        if (t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'))) {
                            const extractJsonLdLocation = (jobLocation) => {
                                const locations = Array.isArray(jobLocation) ? jobLocation : (jobLocation ? [jobLocation] : []);
                                for (const loc of locations) {
                                    const addr = loc?.address || loc?.jobLocation?.address;
                                    if (!addr) continue;
                                    const locality = addr.addressLocality || null;
                                    const region = addr.addressRegion || null;
                                    const country = typeof addr.addressCountry === 'string'
                                        ? addr.addressCountry
                                        : (addr.addressCountry?.name || null);
                                    const parts = [locality, region, country].map(normalizeLocation).filter(Boolean);
                                    if (parts.length) return parts.join(', ');
                                }
                                return null;
                            };
                            return {
                                title: e.title || e.name || null,
                                company: e.hiringOrganization?.name || null,
                                date_posted: e.datePosted || null,
                                description_html: e.description || null,
                                location: extractJsonLdLocation(e.jobLocation) || null,
                                salary: e.baseSalary?.value?.value || e.baseSalary?.value || null,
                                job_type: e.employmentType || null,
                            };
                        }
                    }
                } catch (err) {
                    log.debug(`JSON-LD parsing error: ${err.message}`);
                }
            }
            return null;
        }

        function findJobLinks($, base) {
            const links = new Set();

            // Wuzzuf-specific job link patterns
            $('a[href*="/jobs/p/"]').each((_, a) => {
                const href = $(a).attr('href');
                if (href && !href.includes('#') && !href.includes('javascript:')) {
                    const abs = toAbs(href, base);
                    if (abs && !processedUrls.has(abs)) {
                        links.add(abs);
                    }
                }
            });

            // Alternative selector
            $('h2.css-m604qf a, .css-1gatmva a[href*="/jobs/"]').each((_, a) => {
                const href = $(a).attr('href');
                if (href) {
                    const abs = toAbs(href, base);
                    if (abs && !processedUrls.has(abs)) {
                        links.add(abs);
                    }
                }
            });

            return [...links];
        }

        function findNextPage($, base, currentPage) {
            // Wuzzuf pagination pattern
            const nextPage = currentPage + 1;

            // Check for next button
            const nextLink = $('a[aria-label="Next"]').attr('href') ||
                $('a.css-1qtdzjz[rel="next"]').attr('href') ||
                $('a:contains("›")').attr('href') ||
                $('li.next a').attr('href');

            if (nextLink) {
                return toAbs(nextLink, base);
            }

            // Build next page URL manually
            const currentUrl = new URL(base);
            currentUrl.searchParams.set('start', String(nextPage * 15)); // Wuzzuf shows 15 jobs per page
            return currentUrl.href;
        }

        const crawler = new CheerioCrawler({
            proxyConfiguration: proxyConf,
            maxRequestRetries: 3,
            useSessionPool: true,
            maxConcurrency: 5,
            requestHandlerTimeoutSecs: 90,

            async requestHandler({ request, $, enqueueLinks, log: crawlerLog, body }) {
                const label = request.userData?.label || 'LIST';
                const pageNo = request.userData?.pageNo || 1;

                if (label === 'LIST') {
                    crawlerLog.info(`Processing search page ${pageNo} - ${request.url}`);

                    const links = findJobLinks($, request.url);
                    crawlerLog.info(`Found ${links.length} job links on page ${pageNo}`);

                    if (collectDetails && links.length > 0) {
                        const remaining = RESULTS_WANTED - saved;
                        const toEnqueue = links.slice(0, Math.max(0, remaining));

                        for (const link of toEnqueue) {
                            processedUrls.add(link);
                        }

                        if (toEnqueue.length > 0) {
                            await enqueueLinks({
                                urls: toEnqueue,
                                userData: { label: 'DETAIL' },
                            });
                        }
                    } else if (!collectDetails && links.length > 0) {
                        const remaining = RESULTS_WANTED - saved;
                        const toPush = links.slice(0, Math.max(0, remaining));

                        if (toPush.length > 0) {
                            await Dataset.pushData(
                                toPush.map((u) => ({
                                    url: u,
                                    source: 'wuzzuf.net',
                                }))
                            );
                            saved += toPush.length;
                        }
                    }

                    // Handle pagination
                    if (saved < RESULTS_WANTED && pageNo < MAX_PAGES && links.length > 0) {
                        const next = findNextPage($, request.url, pageNo);
                        if (next) {
                            crawlerLog.info(`Enqueueing next page: ${pageNo + 1}`);
                            await enqueueLinks({
                                urls: [next],
                                userData: { label: 'LIST', pageNo: pageNo + 1 },
                            });
                        } else {
                            crawlerLog.info('No more pages found');
                        }
                    }
                    return;
                }

                if (label === 'DETAIL') {
                    if (saved >= RESULTS_WANTED) {
                        crawlerLog.info('Reached target number of results, skipping');
                        return;
                    }

                    try {
                        crawlerLog.info(`Extracting job details from ${request.url}`);

                        // Try JSON-LD first
                        let data = extractFromJsonLd($);

                        if (data && data.title) {
                            crawlerLog.info(`Successfully extracted data from JSON-LD: ${data.title}`);
                        } else {
                            crawlerLog.info('No JSON-LD data found, using HTML extraction');
                        }

                        if (!data) {
                            data = {};
                        }

                        // HTML fallback extraction with Wuzzuf-specific selectors
                        crawlerLog.debug('Starting HTML extraction...');
                        if (!data.title) {
                            data.title = $('h1.css-f9uh36, h1[data-qa="job-title"]').first().text().trim() ||
                                $('h1').first().text().trim() || null;
                        }

                        if (!data.company) {
                            // Extract company name - find link with /jobs/careers/ in href
                            $('a[href*="/jobs/careers/"]').each((_, el) => {
                                const href = $(el).attr('href');
                                const text = $(el).text().trim();

                                if (text && text.length > 1 && text.length < 100 && isValidText(text) && href && href.includes('/jobs/careers/')) {
                                    data.company = text;
                                    return false; // Break the loop
                                }
                            });

                            data.company = data.company || null;
                        }

                        if (!data.location) {
                            // Look for location using specific selectors
                            let locationFound = null;

                            // Helper to validate location text
                            const isValidLocation = (text) => {
                                if (!text || text.length < 2 || text.length > 80) return false;
                                const lower = text.toLowerCase();
                                // Filter out invalid patterns
                                if (lower.includes('other jobs') ||
                                    lower.includes('work role') ||
                                    lower.includes('webkit') ||
                                    lower.includes('css') ||
                                    lower.includes('browse') ||
                                    lower.includes('search') ||
                                    lower.includes('apply') ||
                                    text.includes('{') ||
                                    text.includes('}') ||
                                    text.includes('[') ||
                                    text.includes(']')) {
                                    return false;
                                }
                                return true;
                            };

                            // Priority 0: Meta tags + <title> (most stable across job pages)
                            const metaLocation = extractLocationFromMeta($) || extractLocationFromTitle($);
                            if (metaLocation && isValidLocation(metaLocation) && isValidText(metaLocation)) {
                                locationFound = metaLocation;
                            }

                            // Method 1: Robust extraction from text near company link (most stable)
                            const companyLink = $('a[href*="/jobs/careers/"]').first();
                            if (companyLink.length) {
                                const parentText = companyLink.parent().text().trim();
                                const companyName = companyLink.text().trim();
                                let potentialLoc = parentText.replace(companyName, '').trim();

                                // Refinement: Split by delimiters to isolate location
                                const parts = potentialLoc.split(/\s*[–—-]\s*/).map(p => p.trim()).filter(Boolean);
                                let bestMatch = null;

                                // Check each part for location pattern
                                for (const part of parts) {
                                    const clean = part.replace(/Posted.*$/i, '').replace(/Block.*$/i, '').replace(/Viewed.*$/i, '').trim();
                                    if (clean.length > 2 && clean.length < 50 && isValidText(clean)) {
                                        if (clean.includes(',') || /remote|work from home|hybrid/i.test(clean)) {
                                            bestMatch = clean;
                                            break;
                                        }
                                    }
                                }

                                potentialLoc = bestMatch || potentialLoc.replace(/^\s*[–—-]+\s*/, '').replace(/Posted.*$/i, '').replace(/Block.*$/i, '').replace(/Viewed.*$/i, '').trim();

                                if (potentialLoc.length > 3 && potentialLoc.length < 50 && isValidText(potentialLoc)) {
                                    if (potentialLoc.includes(',') || /remote|work from home|hybrid/i.test(potentialLoc)) {
                                        locationFound = potentialLoc;
                                    }
                                }
                            }

                            // Method 2: Fallback to scanning all spans for city/country patterns
                            if (!locationFound) {
                                $('span, div').each((_, el) => {
                                    const text = $(el).text().trim();
                                    if (!isValidLocation(text) || !isValidText(text)) return;
                                    if (text.includes('Posted') || text.includes('ago')) return;
                                    if (text.includes(',') || /remote|work from home|hybrid/i.test(text)) {
                                        locationFound = text;
                                        return false; // Break
                                    }
                                });
                            }

                            // Priority 3: Extract from company link parent text after dash
                            if (!locationFound) {
                                const companyLink = $('a[href*="/jobs/careers/"]').first();
                                if (companyLink.length) {
                                    const parent = companyLink.parent();
                                    const parentText = parent.text().trim();
                                    const companyName = companyLink.text().trim();
                                    // Remove company name and look for location after dash
                                    const afterCompany = parentText.replace(companyName, '').trim();
                                    const match = afterCompany.match(/^\s*[–—-]+\s*([^|•]+)\s*$/);
                                    if (match && match[1]) {
                                        const loc = match[1].trim();
                                        if (isValidLocation(loc)) {
                                            locationFound = loc;
                                        }
                                    }
                                }
                            }

                            data.location = locationFound;
                        }

                        if (!data.salary) {
                            // Try to find salary information
                            const salarySelectors = [
                                'div.css-rcl8e5 span',
                                'div[class*="salary"]',
                                'span.css-4xky9y',
                                'div:contains("Salary") + div',
                                'div:contains("EGP")'
                            ];

                            for (const selector of salarySelectors) {
                                const salaryEl = $(selector).first();
                                if (salaryEl.length) {
                                    const salaryText = salaryEl.text().trim();
                                    if (salaryText && salaryText.length > 0) {
                                        data.salary = salaryText.replace(/\s+/g, ' ');
                                        break;
                                    }
                                }
                            }

                            data.salary = data.salary || 'Not disclosed';
                        }

                        if (!data.job_type) {
                            // Robust Job Type Extraction
                            const jobTypes = [];

                            // Method 1: href patterns (Most reliable)
                            const jobTypePatterns = {
                                'Full Time': /Full-Time-Jobs/i,
                                'Part Time': /Part-Time-Jobs/i,
                                'Freelance': /Freelance.*Jobs/i,
                                'Remote': /Remote-Jobs/i,
                                'Internship': /Internship.*Jobs/i,
                                'Work From Home': /Work.*From.*Home/i,
                                'Shift Based': /Shift.*Based/i
                            };

                            $('a[href*="-Jobs"]').each((_, el) => {
                                const href = $(el).attr('href') || '';
                                const text = $(el).text().trim();

                                for (const [typeName, pattern] of Object.entries(jobTypePatterns)) {
                                    if (pattern.test(href) && !jobTypes.includes(typeName)) {
                                        if (text && text.length < 30 && isValidText(text)) {
                                            jobTypes.push(typeName);
                                        }
                                        break;
                                    }
                                }
                            });

                            // Method 2: Text content search in spans (Fallback)
                            if (jobTypes.length === 0) {
                                const commonTypes = ['Full Time', 'Part Time', 'Freelance', 'Remote', 'Internship'];
                                $('span').each((_, el) => {
                                    const text = $(el).text().trim();
                                    if (commonTypes.includes(text)) {
                                        if (!jobTypes.includes(text)) jobTypes.push(text);
                                    }
                                });
                            }

                            data.job_type = jobTypes.length > 0 ? jobTypes.join(' / ') : null;
                        }

                        if (!data.date_posted) {
                            // Try multiple selectors for date posted
                            const dateSelectors = [
                                'div.css-4c4ojb',
                                'div.css-do6t5g',
                                'div[class*="job-date"]',
                                'span:contains("ago")',
                                'div:contains("hours ago")',
                                'div:contains("days ago")',
                                'time'
                            ];

                            for (const selector of dateSelectors) {
                                const dateEl = $(selector).first();
                                if (dateEl.length) {
                                    const dateText = dateEl.text().trim();
                                    if (dateText && (dateText.includes('ago') || dateText.includes('hour') || dateText.includes('day'))) {
                                        data.date_posted = dateText.replace(/\s+/g, ' ');
                                        break;
                                    }
                                }
                            }

                            data.date_posted = data.date_posted || null;
                        }

                        // Extract job category from links with /a/...-Jobs pattern
                        const jobCategories = [];
                        const excludePatterns = ['Full-Time', 'Part-Time', 'Freelance', 'Remote', 'Internship',
                            'Work-From-Home', 'Shift-Based', 'Entry-Level', 'Experienced', 'Manager',
                            'Senior-Management', 'Student'];

                        $('a[href*="/a/"][href*="-Jobs"]').each((_, el) => {
                            const href = $(el).attr('href') || '';
                            const text = $(el).text().trim();

                            // Exclude job type and career level links
                            const isExcluded = excludePatterns.some(pattern => href.includes(pattern));

                            if (text && text.length > 1 && text.length < 50 && isValidText(text) && !isExcluded) {
                                if (!jobCategories.includes(text)) {
                                    jobCategories.push(text);
                                }
                            }
                        });
                        data.job_category = jobCategories.length > 0 ? jobCategories : null;

                        // Extract full description - CRITICAL: Remove style tags and related jobs
                        if (!data.description_html) {
                            // Remove all style tags and related job sections first
                            $('style, script, noscript').remove();
                            $('ul.css-1b1zfbw').remove(); // Related jobs section
                            $('ul.css-1e3unnb').remove(); // Stats section
                            $('div[class*="similar"], div[class*="related"]').remove();

                            // Now try to find actual job description
                            let descriptionParts = [];

                            // Find UL/OL tags that are NOT the removed sections
                            $('ul, ol').each((_, el) => {
                                const $el = $(el);
                                // Skip if has specific classes we want to avoid
                                const classAttr = $el.attr('class') || '';
                                if (classAttr && (classAttr.includes('css-1b1zfbw') ||
                                    classAttr.includes('css-h5dsne') ||
                                    classAttr.includes('css-1e3unnb'))) {
                                    return; // Skip
                                }

                                const html = $el.html();
                                const text = $el.text().trim();

                                // Valid description list: has actual text, not too short
                                if (text && text.length > 20 && !text.includes('Viewed') && !text.includes('Not Selected')) {
                                    descriptionParts.push(`<${el.name}>${html}</${el.name}>`);
                                }
                            });

                            // Also get paragraphs
                            $('p').each((_, el) => {
                                const $el = $(el);
                                const html = $el.html();
                                const text = $el.text().trim();

                                if (text && text.length > 20) {
                                    descriptionParts.push(`<p>${html}</p>`);
                                }
                            });

                            if (descriptionParts.length > 0) {
                                data.description_html = descriptionParts.join('\n');
                            }
                        }

                        // Clean description HTML - remove any remaining style tags
                        if (data.description_html) {
                            // Remove style tags with regex
                            data.description_html = data.description_html
                                .replace(/<style[^>]*>.*?<\/style>/gis, '')
                                .replace(/<script[^>]*>.*?<\/script>/gis, '')
                                .replace(/class="css-[a-z0-9]+"/gi, '')
                                .replace(/data-emotion="[^"]*"/gi, '')
                                .trim();
                        }

                        data.description_text = data.description_html ? cleanText(data.description_html) : null;

                        // Extract career level - clean text only
                        let careerLevelText = null;
                        const careerLevelPatterns = [
                            'a[href*="Entry-Level-Jobs"]',
                            'a[href*="Experienced-Jobs"]',
                            'a[href*="Manager-Jobs"]',
                            'a[href*="Senior-Management-Jobs"]',
                            'a[href*="Student-Jobs"]',
                            'span[class*="career"]',
                            'div:contains("Career Level") + div'
                        ];

                        for (const pattern of careerLevelPatterns) {
                            const levelEl = $(pattern).first();
                            if (levelEl.length) {
                                const text = levelEl.text().trim();
                                if (text && text.length > 0 && text.length < 50 && !text.includes('http') && !text.includes('css-')) {
                                    careerLevelText = text;
                                    break;
                                }
                            }
                        }

                        // Extract skills - use multiple fallback selectors
                        const skills = [];
                        const addedSkills = new Set();

                        // Priority 1: data-qa attribute (most reliable)
                        $('a[data-qa="skill-tag"]').each((_, el) => {
                            const skill = $(el).text().trim();
                            if (skill && skill.length > 0 && skill.length < 100 && isValidText(skill) && !addedSkills.has(skill.toLowerCase())) {
                                skills.push(skill);
                                addedSkills.add(skill.toLowerCase());
                            }
                        });

                        // Priority 2: Look for skill-related sections with span content  
                        $('h4:contains("Skills")').each((_, h4) => {
                            $(h4).parent().find('span, a').each((_, el) => {
                                const skill = $(el).text().trim();
                                if (skill && skill.length > 1 && skill.length < 50 && isValidText(skill) && !addedSkills.has(skill.toLowerCase())) {
                                    // Avoid adding the header itself
                                    if (skill.toLowerCase() !== 'skills' && skill.toLowerCase() !== 'skills and tools:') {
                                        skills.push(skill);
                                        addedSkills.add(skill.toLowerCase());
                                    }
                                }
                            });
                        });

                        // Extract company logo - Robust
                        let companyLogo = null;

                        const extractLogoFromImg = (imgEl) => {
                            if (!imgEl) return null;
                            const attrs = ['src', 'data-src', 'data-lazy-src', 'data-original', 'srcset'];
                            for (const attr of attrs) {
                                const raw = $(imgEl).attr(attr);
                                if (!raw) continue;
                                if (attr === 'srcset') {
                                    const firstCandidate = String(raw).split(',')[0]?.trim().split(/\s+/)[0];
                                    const normalized = normalizeUrl(firstCandidate);
                                    if (normalized) return normalized;
                                    continue;
                                }
                                const normalized = normalizeUrl(raw);
                                if (normalized) return normalized;
                            }
                            return null;
                        };

                        // Method 1: Try stable class seen in browser DOM (css-1rlnv46)
                        const logoImg = $('img.css-1rlnv46, img.css-1in28d3').first();
                        if (logoImg.length) {
                            companyLogo = extractLogoFromImg(logoImg.get(0));
                        }

                        // Method 2: Look for image inside company link (fallback)
                        if (!companyLogo) {
                            $('a[href*="/jobs/careers/"] img').each((_, img) => {
                                const candidate = extractLogoFromImg(img);
                                if (candidate && !candidate.includes('placeholder')) {
                                    companyLogo = candidate;
                                    return false; // break
                                }
                            });
                        }

                        // Final normalization (ensures no query params / data: URIs)
                        companyLogo = normalizeUrl(companyLogo);

                        // Sanitize all text fields to remove CSS classes and HTML artifacts
                        const item = {
                            title: sanitizeText(data.title),
                            company: sanitizeText(data.company),
                            company_logo: companyLogo,
                            location: sanitizeText(data.location),
                            salary: sanitizeText(data.salary) || 'Not disclosed',
                            job_type: sanitizeText(data.job_type),
                            job_category: data.job_category ? data.job_category.map(c => sanitizeText(c)).filter(Boolean) : null,
                            career_level: sanitizeText(careerLevelText),
                            date_posted: sanitizeText(data.date_posted),
                            skills: skills.length > 0 ? skills.map(s => sanitizeText(s)).filter(Boolean) : null,
                            description_html: data.description_html || null,
                            description_text: data.description_text || null,
                            url: request.url,
                            scraped_at: new Date().toISOString(),
                        };

                        // Final validation - skip if critical fields contain CSS artifacts
                        if (item.title && !isValidText(item.title)) {
                            crawlerLog.warning(`Skipping job with invalid title containing CSS: ${item.title}`);
                            return;
                        }
                        if (item.company && !isValidText(item.company)) {
                            crawlerLog.warning(`Skipping job with invalid company containing CSS: ${item.company}`);
                            return;
                        }

                        // Ensure minimum data quality
                        if (!item.title) {
                            crawlerLog.warning(`Skipping job without title: ${request.url}`);
                            return;
                        }

                        // Log extraction quality
                        const extractionQuality = {
                            title: !!item.title,
                            company: !!item.company,
                            location: !!item.location,
                            description: !!item.description_html,
                            date_posted: !!item.date_posted
                        };
                        crawlerLog.debug(`Extraction quality: ${JSON.stringify(extractionQuality)}`);

                        // Warn if critical fields are missing
                        if (!item.company) {
                            crawlerLog.warning(`Missing company name for job: ${item.title || 'Unknown'}`);
                        }
                        if (!item.description_html) {
                            crawlerLog.warning(`Missing description for job: ${item.title || 'Unknown'}`);
                        }

                        // Filter out jobs that are too old
                        if (!isJobWithinAgeLimit(item.date_posted, maxJobAge)) {
                            crawlerLog.info(`Skipping job "${item.title}" - posted ${item.date_posted} (outside age limit: ${maxJobAge})`);
                            return;
                        }

                        await Dataset.pushData(item);
                        saved++;
                        crawlerLog.info(`✓ Successfully saved job ${saved}/${RESULTS_WANTED}: ${item.title}`);
                    } catch (err) {
                        crawlerLog.error(`Failed to extract job details from ${request.url}: ${err.message}`);
                    }
                }
            },
        });

        await crawler.run(
            initial.map((u) => ({
                url: u,
                userData: { label: 'LIST', pageNo: 1 },
            }))
        );

        log.info(`✓ Scraping completed. Successfully saved ${saved} job listings from Wuzzuf.`);
    } finally {
        await Actor.exit();
    }
}

main().catch((err) => {
    log.error(`Fatal error: ${err.message}`);
    console.error(err);
    process.exit(1);
});
