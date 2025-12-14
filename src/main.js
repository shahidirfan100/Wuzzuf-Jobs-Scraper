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

        const cleanText = (html) => {
            if (!html) return '';
            const $ = cheerioLoad(html);
            $('script, style, noscript, iframe').remove();
            return $.root().text().replace(/\s+/g, ' ').trim();
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
                            return {
                                title: e.title || e.name || null,
                                company: e.hiringOrganization?.name || null,
                                date_posted: e.datePosted || null,
                                description_html: e.description || null,
                                location: e.jobLocation?.address?.addressLocality || 
                                         e.jobLocation?.address?.addressRegion || null,
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
                        
                        if (!data) {
                            data = {};
                        }

                        // HTML fallback extraction with Wuzzuf-specific selectors
                        if (!data.title) {
                            data.title = $('h1.css-f9uh36, h1[data-qa="job-title"]').first().text().trim() ||
                                        $('h1').first().text().trim() || null;
                        }

                        if (!data.company) {
                            data.company = $('a.css-17s97q8, a[data-qa="company-name"], .css-17s97q8').first().text().trim() ||
                                         $('div.css-d7j1kk a').first().text().trim() || null;
                        }

                        if (!data.location) {
                            data.location = $('span.css-5wys0k, [data-qa="job-location"]').first().text().trim() ||
                                          $('div:contains("Location")').next().text().trim() || null;
                        }

                        if (!data.salary) {
                            data.salary = $('span.css-4xky9y, [data-qa="salary"]').first().text().trim() ||
                                        $('div:contains("Salary")').next().text().trim() || null;
                        }

                        if (!data.job_type) {
                            data.job_type = $('span.css-1ve4b75, [data-qa="job-type"]').first().text().trim() ||
                                          $('a[href*="Full-Time"], a[href*="Part-Time"], a[href*="Freelance"]').first().text().trim() || null;
                        }

                        if (!data.date_posted) {
                            const dateText = $('div.css-4c4ojb, div.css-do6t5g, [data-qa="posted-date"]').first().text().trim();
                            data.date_posted = dateText || null;
                        }

                        // Extract full description
                        if (!data.description_html) {
                            const descSection = $('div.css-1uobp1k, div[data-qa="job-description"], .job-description').first();
                            data.description_html = descSection && descSection.length
                                ? String(descSection.html()).trim()
                                : null;
                        }

                        data.description_text = data.description_html ? cleanText(data.description_html) : null;

                        // Extract career level
                        const careerLevelText = $('a[href*="Entry-Level"], a[href*="Experienced"], a[href*="Manager"], a[href*="Senior"]')
                            .first().text().trim() || null;

                        // Extract skills
                        const skills = [];
                        $('div.css-158icaa a, a[data-qa="skill-tag"]').each((_, el) => {
                            const skill = $(el).text().trim();
                            if (skill) skills.push(skill);
                        });

                        const item = {
                            title: data.title || null,
                            company: data.company || null,
                            location: data.location || null,
                            salary: data.salary || null,
                            job_type: data.job_type || null,
                            career_level: careerLevelText || null,
                            date_posted: data.date_posted || null,
                            skills: skills.length > 0 ? skills : null,
                            description_html: data.description_html || null,
                            description_text: data.description_text || null,
                            url: request.url,
                            scraped_at: new Date().toISOString(),
                        };

                        await Dataset.pushData(item);
                        saved++;
                        crawlerLog.info(`Successfully saved job ${saved}/${RESULTS_WANTED}: ${item.title}`);
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
