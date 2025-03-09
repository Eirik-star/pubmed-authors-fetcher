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
            
            if (retStart === 0) {
                console.log('🌐 Connecting to PubMed API...');
                console.log('📝 Search query:', decodeURIComponent(filters));
            } else {
                console.log(`📄 Fetching results page ${Math.floor(retStart/DEFAULT_RETMAX) + 1}...`);
            }
            
            const searchResponse = await fetchWithRetry(searchUrl);
            const searchResult = await this.parseXml(searchResponse.data);
            
            if (!searchResult.eSearchResult?.IdList?.Id) {
                break; // No more results
            }

            const ids = Array.isArray(searchResult.eSearchResult.IdList.Id)
                ? searchResult.eSearchResult.IdList.Id
                : [searchResult.eSearchResult.IdList.Id];
            
            allIds = allIds.concat(ids);
            
            // If we got fewer results than requested, we've reached the end
            if (ids.length < DEFAULT_RETMAX) {
                break;
            }
            
            retStart += DEFAULT_RETMAX;
            
            // Add a small delay between pagination requests
            if (retStart < MAX_RESULTS) {
                console.log('⏳ Waiting between pagination requests...');
                await delay(DELAY_MS);
            }
        }

        if (allIds.length === 0) {
            throw new Error('No article IDs found in the search response');
        }

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
            
            if (fetchResult.PubmedArticleSet?.PubmedArticle) {
                const batchArticles = Array.isArray(fetchResult.PubmedArticleSet.PubmedArticle)
                    ? fetchResult.PubmedArticleSet.PubmedArticle
                    : [fetchResult.PubmedArticleSet.PubmedArticle];
                
                allArticles = allArticles.concat(batchArticles);
            }
            
            if (i < batches.length - 1) {
                console.log('⏳ Waiting between batches...');
                await delay(DELAY_MS);
            }
        }
        
        return allArticles;
    }

    validateTitle(title) {
        if (!title) return false;
        
        const normalizedTitle = title.toLowerCase();
        const keywords = SEARCH_TERMS.KEYWORDS.map(k => k.toLowerCase());
        
        return keywords.some(keyword => normalizedTitle.includes(keyword));
    }

    validateArticleData(article, index) {
        if (!article.MedlineCitation?.Article?.ArticleTitle) {
            console.warn(`⚠️  Article #${index + 1} is missing title information`);
            return false;
        }
        
        const title = article.MedlineCitation.Article.ArticleTitle;
        const titleStr = typeof title === 'object' ? title._ || title.toString() : title;

        // Check if title contains at least one keyword
        if (!this.validateTitle(titleStr)) {
            console.warn(`⚠️  Article #${index + 1} title does not contain any search keywords: "${titleStr}"`);
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
                return; // Skip invalid articles
            }
            processedCount++;
            if (processedCount % 10 === 0) {
                console.log(`⏳ Processed ${processedCount}/${articles.length} articles...`);
            }
            
            const articleData = article.MedlineCitation.Article;
            const title = typeof articleData.ArticleTitle === 'object' 
                ? articleData.ArticleTitle._ || articleData.ArticleTitle.toString()
                : articleData.ArticleTitle;
            
            const pubDate = article.MedlineCitation.Article.Journal.JournalIssue.PubDate;
            const year = pubDate.Year || '';
            const titleWithYear = `${title} (${year})`;
            
            if (articleData.AuthorList?.Author) {
                const authors = Array.isArray(articleData.AuthorList.Author)
                    ? articleData.AuthorList.Author
                    : [articleData.AuthorList.Author];
                
                authors.forEach(author => {
                    const fullName = this.formatAuthorName(author);
                    if (!authorMap.has(fullName)) {
                        authorMap.set(fullName, {
                            affiliations: new Set(),
                            titles: new Set()
                        });
                    }
                    
                    authorMap.get(fullName).titles.add(titleWithYear);
                    this.addAffiliations(author, authorMap.get(fullName).affiliations);
                });
            }
        });
        
        // Add summary of filtered articles
        console.log('\n📊 Article Processing Summary:');
        console.log(`   ✅ Accepted articles: ${processedCount}`);
        console.log(`   ❌ Filtered out: ${skippedCount}`);
        console.log(`   📈 Acceptance rate: ${((processedCount / articles.length) * 100).toFixed(1)}%`);
        
        return authorMap;
    }

    formatAuthorName(author) {
        if (author.LastName && author.ForeName) {
            return `${author.ForeName} ${author.LastName}`;
        } else if (author.LastName) {
            return author.LastName;
        } else if (author.CollectiveName) {
            return author.CollectiveName;
        }
        return '';
    }

    addAffiliations(author, affiliationSet) {
        if (author.AffiliationInfo) {
            const affiliations = Array.isArray(author.AffiliationInfo)
                ? author.AffiliationInfo
                : [author.AffiliationInfo];
            
            affiliations.forEach(affiliation => {
                if (affiliation.Affiliation) {
                    affiliationSet.add(affiliation.Affiliation);
                }
            });
        }
    }
}

module.exports = new PubMedService(); 