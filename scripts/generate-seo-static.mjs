#!/usr/bin/env node
/**
 * Genereert public/sitemap.xml en werkt de Sitemap-regel in public/robots.txt bij.
 * Draai na routewijzigingen: npm run generate:seo
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const SITE_URL = (process.env.VITE_SITE_URL || 'https://harelbekeminivoetbal.be').replace(/\/$/, '');
const today = new Date().toISOString().slice(0, 10);

const routes = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/competitie', priority: '0.9', changefreq: 'daily' },
  { path: '/beker', priority: '0.8', changefreq: 'weekly' },
  { path: '/playoff', priority: '0.8', changefreq: 'weekly' },
  { path: '/reglement', priority: '0.7', changefreq: 'monthly' },
  { path: '/archief', priority: '0.7', changefreq: 'monthly' },
];

const urlEntries = routes
  .map(
    ({ path, priority, changefreq }) => `  <url>
    <loc>${SITE_URL}${path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`,
  )
  .join('\n\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">

${urlEntries}

</urlset>
`;

writeFileSync(join(root, 'public/sitemap.xml'), sitemap);

const robotsPath = join(root, 'public/robots.txt');
const robots = readFileSync(robotsPath, 'utf8');
const updatedRobots = robots.replace(
  /^Sitemap:.*$/m,
  `Sitemap: ${SITE_URL}/sitemap.xml`,
);
writeFileSync(robotsPath, updatedRobots);

console.log(`SEO static files generated for ${SITE_URL}`);
