# Wuzzuf Jobs Scraper

Extract job listings from Wuzzuf.net, the leading job platform for Egypt and the MENA region. This high-performance scraper collects comprehensive job data including titles, companies, locations, salaries, requirements, and full descriptions.

## Key Features

<ul>
  <li><strong>Smart Data Extraction:</strong> Uses JSON API as primary source with automatic HTML fallback for maximum reliability</li>
  <li><strong>Comprehensive Data:</strong> Extracts job title, company, location, salary, job type, career level, skills, posting date, and full descriptions</li>
  <li><strong>Advanced Filtering:</strong> Search by keyword, location, category, career level, and employment type</li>
  <li><strong>Efficient Pagination:</strong> Automatically handles multi-page results with configurable limits</li>
  <li><strong>Structured Output:</strong> Clean, consistent JSON format ready for analysis and integration</li>
  <li><strong>Production Ready:</strong> Built with enterprise-grade error handling and retry logic</li>
</ul>

## Use Cases

<ul>
  <li>Job market research and analysis for Egypt and MENA region</li>
  <li>Salary benchmarking and compensation studies</li>
  <li>Recruitment pipeline automation</li>
  <li>Skills demand tracking and trend analysis</li>
  <li>Job aggregation platforms and job boards</li>
  <li>Career guidance and job recommendation systems</li>
</ul>

## Input Configuration

Configure the scraper using these parameters:

### Search Parameters

<table>
  <thead>
    <tr>
      <th>Parameter</th>
      <th>Type</th>
      <th>Description</th>
      <th>Example</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>keyword</code></td>
      <td>String</td>
      <td>Search for specific job titles or keywords</td>
      <td>"software engineer", "accountant"</td>
    </tr>
    <tr>
      <td><code>location</code></td>
      <td>String</td>
      <td>Filter jobs by city or region</td>
      <td>"Cairo", "Alexandria", "Dubai"</td>
    </tr>
    <tr>
      <td><code>category</code></td>
      <td>String</td>
      <td>Filter by job category</td>
      <td>"IT/Software Development"</td>
    </tr>
    <tr>
      <td><code>careerLevel</code></td>
      <td>String</td>
      <td>Filter by experience level</td>
      <td>"Entry Level", "Experienced"</td>
    </tr>
    <tr>
      <td><code>jobType</code></td>
      <td>String</td>
      <td>Filter by employment type</td>
      <td>"Full Time", "Remote"</td>
    </tr>
    <tr>
      <td><code>startUrl</code></td>
      <td>String</td>
      <td>Custom Wuzzuf search URL (overrides other filters)</td>
      <td>"https://wuzzuf.net/search/jobs/?q=..."</td>
    </tr>
  </tbody>
</table>

### Control Parameters

<table>
  <thead>
    <tr>
      <th>Parameter</th>
      <th>Type</th>
      <th>Default</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>results_wanted</code></td>
      <td>Integer</td>
      <td>100</td>
      <td>Maximum number of jobs to collect (1-1000)</td>
    </tr>
    <tr>
      <td><code>max_pages</code></td>
      <td>Integer</td>
      <td>20</td>
      <td>Maximum search pages to process (~15 jobs per page)</td>
    </tr>
    <tr>
      <td><code>collectDetails</code></td>
      <td>Boolean</td>
      <td>true</td>
      <td>Extract full job descriptions and details</td>
    </tr>
    <tr>
      <td><code>proxyConfiguration</code></td>
      <td>Object</td>
      <td>Residential</td>
      <td>Proxy settings for reliable scraping</td>
    </tr>
  </tbody>
</table>

### Input Example

```json
{
  "keyword": "software engineer",
  "location": "Cairo",
  "category": "IT/Software Development",
  "careerLevel": "Experienced",
  "jobType": "Full Time",
  "results_wanted": 50,
  "max_pages": 5,
  "collectDetails": true
}
```

## Output Format

Each job listing contains the following structured data:

```json
{
  "title": "Senior Software Engineer",
  "company": "Tech Company Egypt",
  "location": "Maadi, Cairo, Egypt",
  "salary": "Confidential",
  "job_type": "Full Time",
  "career_level": "Experienced",
  "date_posted": "3 hours ago",
  "skills": [
    "JavaScript",
    "React",
    "Node.js",
    "MongoDB"
  ],
  "description_html": "<div>Full HTML job description...</div>",
  "description_text": "Plain text job description...",
  "url": "https://wuzzuf.net/jobs/p/...",
  "scraped_at": "2025-12-14T10:30:00.000Z"
}
```

### Output Fields

<table>
  <thead>
    <tr>
      <th>Field</th>
      <th>Type</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>title</code></td>
      <td>String</td>
      <td>Job title or position name</td>
    </tr>
    <tr>
      <td><code>company</code></td>
      <td>String</td>
      <td>Hiring company name</td>
    </tr>
    <tr>
      <td><code>location</code></td>
      <td>String</td>
      <td>Job location (city, country)</td>
    </tr>
    <tr>
      <td><code>salary</code></td>
      <td>String</td>
      <td>Salary range or "Confidential"</td>
    </tr>
    <tr>
      <td><code>job_type</code></td>
      <td>String</td>
      <td>Employment type (Full Time, Part Time, etc.)</td>
    </tr>
    <tr>
      <td><code>career_level</code></td>
      <td>String</td>
      <td>Required experience level</td>
    </tr>
    <tr>
      <td><code>date_posted</code></td>
      <td>String</td>
      <td>When the job was posted</td>
    </tr>
    <tr>
      <td><code>skills</code></td>
      <td>Array</td>
      <td>Required skills and technologies</td>
    </tr>
    <tr>
      <td><code>description_html</code></td>
      <td>String</td>
      <td>Full job description with HTML formatting</td>
    </tr>
    <tr>
      <td><code>description_text</code></td>
      <td>String</td>
      <td>Plain text version of description</td>
    </tr>
    <tr>
      <td><code>url</code></td>
      <td>String</td>
      <td>Direct link to job posting</td>
    </tr>
    <tr>
      <td><code>scraped_at</code></td>
      <td>String</td>
      <td>ISO timestamp of data extraction</td>
    </tr>
  </tbody>
</table>

## How to Use

### Running on Apify Platform

<ol>
  <li>Navigate to the <a href="https://console.apify.com/actors">Apify Console</a></li>
  <li>Search for "Wuzzuf Jobs Scraper" in the Store</li>
  <li>Click "Try for free"</li>
  <li>Configure your search parameters in the Input tab</li>
  <li>Click "Start" to begin scraping</li>
  <li>Download results in JSON, CSV, Excel, or HTML format</li>
</ol>

### API Integration

Use the Apify API to integrate job scraping into your applications:

```javascript
const { ApifyClient } = require('apify-client');

const client = new ApifyClient({
    token: 'YOUR_API_TOKEN',
});

const run = await client.actor('YOUR_ACTOR_ID').call({
    keyword: 'data scientist',
    location: 'Cairo',
    results_wanted: 100,
});

const { items } = await client.dataset(run.defaultDatasetId).listItems();
console.log(items);
```

### Python Example

```python
from apify_client import ApifyClient

client = ApifyClient('YOUR_API_TOKEN')

run = client.actor('YOUR_ACTOR_ID').call(
    run_input={
        'keyword': 'marketing manager',
        'location': 'Dubai',
        'results_wanted': 50
    }
)

dataset = client.dataset(run['defaultDatasetId'])
items = dataset.list_items().items
```

## Performance and Costs

<table>
  <thead>
    <tr>
      <th>Jobs Scraped</th>
      <th>Compute Units</th>
      <th>Runtime</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>50 jobs (details)</td>
      <td>~0.02 CU</td>
      <td>~1-2 minutes</td>
    </tr>
    <tr>
      <td>100 jobs (details)</td>
      <td>~0.04 CU</td>
      <td>~2-4 minutes</td>
    </tr>
    <tr>
      <td>500 jobs (details)</td>
      <td>~0.15 CU</td>
      <td>~10-15 minutes</td>
    </tr>
  </tbody>
</table>

<p><em>Note: Actual costs may vary based on proxy usage and network conditions. Scraping without details (<code>collectDetails: false</code>) is significantly faster.</em></p>

## Best Practices

### Optimal Configuration

<ul>
  <li><strong>Use Specific Keywords:</strong> Narrow searches return more relevant results faster</li>
  <li><strong>Set Reasonable Limits:</strong> Start with <code>results_wanted: 100</code> to control costs</li>
  <li><strong>Enable Proxy:</strong> Use residential proxies for best reliability</li>
  <li><strong>Schedule Regular Runs:</strong> Set up automated scraping to track new job postings</li>
</ul>

### Error Handling

The scraper includes robust error handling:

<ul>
  <li>Automatic retries for failed requests (3 attempts)</li>
  <li>Graceful fallback from JSON API to HTML parsing</li>
  <li>Session management to handle rate limiting</li>
  <li>Detailed logging for troubleshooting</li>
</ul>

## Limitations

<ul>
  <li>Respects website's rate limits and robots.txt</li>
  <li>Requires active Apify account and compute units</li>
  <li>Some job details may be behind authentication</li>
  <li>Output language depends on Wuzzuf's default (primarily Arabic and English)</li>
</ul>

## Frequently Asked Questions

### Can I scrape jobs from specific companies?

Yes, use the keyword parameter with the company name, or provide a custom `startUrl` filtering by company.

### What languages are supported?

The scraper extracts content in both Arabic and English as provided by Wuzzuf.

### How often can I run this scraper?

You can run it as frequently as needed. For job monitoring, we recommend daily or weekly schedules.

### Can I export data to Google Sheets?

Yes, Apify integrations support direct export to Google Sheets, Excel, CSV, JSON, and more.

### Is this scraper compliant with terms of service?

This scraper is designed for legitimate use cases like market research and recruitment. Users are responsible for ensuring their usage complies with applicable terms of service and regulations.

## Support and Feedback

<ul>
  <li>Report issues on <a href="https://github.com">GitHub</a></li>
  <li>Contact via <a href="https://apify.com/contact">Apify Support</a></li>
  <li>Join the <a href="https://discord.com/invite/jyEM2PRvMU">Apify Discord community</a></li>
</ul>

---

<p><small>Made with ❤️ for job seekers and recruiters in the MENA region</small></p>
