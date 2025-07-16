const xml2js = require('xml2js');
const util = require('util');
const { 
    BASE_URL, 
    API_KEY, 
    BATCH_SIZE, 
    DELAY_MS, 
    PUBLICATION_YEARS, 
    MAX_RESULTS, 
    DEFAULT_RETMAX,
    SEARCH_TERMS 
} = require('../config');
const { delay, fetchWithRetry } = require('../utils/apiUtils');

class PubMedService {
    constructor() {
        this.parser = new xml2js.Parser({ explicitArray: false });
        this.parseXml = util.promisify(this.parser.parseString);
    }

    buildSearchFilters() {
        const publicationTypes = SEARCH_TERMS.PUBLICATION_TYPES
            .map(type => `"${type}"[Publication Type]`)
            .join(' OR ');

        return [
            `(${SEARCH_TERMS.QUERY})`,
            'AND',
            '(',
            publicationTypes,
            ')',
            'AND',
            '(',
            `"${PUBLICATION_YEARS.START}"[Date - Publication]`,
            ':',
            `"${PUBLICATION_YEARS.END}"[Date - Publication]`,
            ')'
        ].join(' ');
    }

    async searchArticles() {
        const filters = this.buildSearchFilters();
        let allIds = [];
        let retStart = 0;

        while (retStart < MAX_RESULTS) {
            const searchUrl = `${BASE_URL}esearch.fcgi?db=pubmed&term=${encodeURIComponent(filters)}&retmax=${DEFAULT_RETMAX}&retstart=${retStart}&api_key=${API_KEY}`;
            
            console.log(retStart === 0 
                ? '🌐 Connecting to PubMed API...\n📝 Search query: ' + decodeURIComponent(filters)
                : `📄 Fetching results page ${Math.floor(retStart / DEFAULT_RETMAX) + 1}...`);

            const searchResponse = await fetchWithRetry(searchUrl);
            const searchResult = await this.parseXml(searchResponse.data);

            if (!searchResult.eSearchResult?.IdList?.Id) break;

            const ids = Array.isArray(searchResult.eSearchResult.IdList.Id)
                ? searchResult.eSearchResult.IdList.Id
                : [searchResult.eSearchResult.IdList.Id];

            allIds.push(...ids);

            if (ids.length < DEFAULT_RETMAX) break;
            retStart += DEFAULT_RETMAX;

            if (retStart < MAX_RESULTS) {
                console.log('⏳ Waiting between pagination requests...');
                await delay(DELAY_MS);
            }
        }

        if (!allIds.length) throw new Error('No article IDs found in the search response');
        console.log(`📊 Total articles found: ${allIds.length}`);
        return allIds;
    }

    async fetchArticleDetails(ids) {
        const batches = [];
        for (let i = 0; i < ids.length; i += BATCH_SIZE) {
            batches.push(ids.slice(i, i + BATCH_SIZE));
        }

        console.log(`🔄 Will process articles in ${batches.length} batches\n`);

        let allArticles = [];
        for (let i = 0; i < batches.length; i++) {
            const batchIds = batches[i];
            console.log(`📥 Fetching batch ${i + 1}/${batches.length} (${batchIds.length} articles)...`);

            const fetchUrl = `${BASE_URL}efetch.fcgi?db=pubmed&id=${batchIds.join(',')}&retmode=xml&api_key=${API_KEY}`;
            const fetchResponse = await fetchWithRetry(fetchUrl);
            const fetchResult = await this.parseXml(fetchResponse.data);

            const fetched = fetchResult.PubmedArticleSet?.PubmedArticle;
            if (fetched) {
                allArticles.push(...(Array.isArray(fetched) ? fetched : [fetched]));
            }

            if (i < batches.length - 1) {
                console.log('⏳ Waiting between batches...');
                await delay(DELAY_MS);
            }
        }

        return allArticles;
    }

    normalizeTitle(title) {
        if (typeof title === 'object') {
            return (title._ || title.toString() || '').trim().toLowerCase();
        }
        return (title || '').trim().toLowerCase();
    }

    validateTitle(title) {
        const normalized = this.normalizeTitle(title);
        return SEARCH_TERMS.KEYWORDS.some(keyword => normalized.includes(keyword.toLowerCase()));
    }

    validateArticleData(article, index) {
        const title = article?.MedlineCitation?.Article?.ArticleTitle;
        if (!title) {
            console.warn(`⚠️  Article #${index + 1} is missing title information`);
            return false;
        }

        const titleStr = this.normalizeTitle(title);
        if (!this.validateTitle(titleStr)) {
            console.warn(`⚠️  Article #${index + 1} title does not contain keywords: "${titleStr}"`);
            return false;
        }

        if (typeof title === 'object' && !title._) {
            console.warn(`⚠️  Article #${index + 1} has complex title structure:`, title);
        }

        return true;
    }

    extractAuthorInfo(articles) {
        const authorMap = new Map();
        let processedCount = 0;
        let skippedCount = 0;

        articles.forEach((article, index) => {
            if (!this.validateArticleData(article, index)) {
                skippedCount++;
                return;
            }

            processedCount++;
            if (processedCount % 10 === 0) {
                console.log(`⏳ Processed ${processedCount}/${articles.length} articles...`);
            }

            const articleData = article.MedlineCitation.Article;
            const title = this.normalizeTitle(articleData.ArticleTitle);
            const pubDate = articleData.Journal?.JournalIssue?.PubDate || {};
            const year = pubDate.Year || '';
            const titleWithYear = `${title} (${year})`;

            const authors = articleData.AuthorList?.Author;
            if (!authors) return;

            (Array.isArray(authors) ? authors : [authors]).forEach(author => {
                const fullName = this.formatAuthorName(author);
                if (!fullName) return;

                if (!authorMap.has(fullName)) {
                    authorMap.set(fullName, {
                        affiliations: new Set(),
                        titles: new Set()
                    });
                }

                authorMap.get(fullName).titles.add(titleWithYear);
                this.addAffiliations(author, authorMap.get(fullName).affiliations);
            });
        });

        console.log('\n📊 Article Processing Summary:');
        console.log(`   ✅ Accepted articles: ${processedCount}`);
        console.log(`   ❌ Filtered out: ${skippedCount}`);
        console.log(`   📈 Acceptance rate: ${((processedCount / articles.length) * 100).toFixed(1)}%`);

        return authorMap;
    }

    formatAuthorName(author) {
        if (author.LastName && author.ForeName) {
            return `${author.ForeName} ${author.LastName}`;
        }
        if (author.LastName) return author.LastName;
        if (author.CollectiveName) return author.CollectiveName;
        return '';
    }

    addAffiliations(author, affiliationSet) {
        if (!author.AffiliationInfo) return;

        const infos = Array.isArray(author.AffiliationInfo)
            ? author.AffiliationInfo
            : [author.AffiliationInfo];

        infos.forEach(info => {
            if (info.Affiliation) {
                affiliationSet.add(info.Affiliation);
            }
        });
    }
}

module.exports = new PubMedService();
