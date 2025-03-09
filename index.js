const axios = require('axios');
const xml2js = require('xml2js');
const util = require('util');
const fs = require('fs');
const path = require('path');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Store API key as a constant
const API_KEY = '1a684dcfeb101623946bdc604d2c4ffd3a09';

async function fetchWithRetry(url, retries = 3, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      if (i > 0) {
        console.log(`🔄 Retry attempt ${i + 1}/${retries}...`);
        await delay(delayMs);
      }
      return await axios.get(url);
    } catch (error) {
      if (i === retries - 1) throw error;
      console.log(`⚠️  Request failed, will retry in ${delayMs/1000} seconds...`);
      await delay(delayMs);
    }
  }
}

async function searchPubMed(searchTerm) {
  try {
    console.log('\n🔍 Starting PubMed search for:', searchTerm);
    console.log('📅 Filtering for Clinical Trials and Meta-Analyses from 2021-2025\n');

    const authorMap = new Map();
    const baseUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/";
    
    const filters = [
      `(${searchTerm})`,
      'AND',
      '(',
        '"Clinical Trial"[Publication Type]',
        'OR',
        '"Meta-Analysis"[Publication Type]',
      ')',
      'AND',
      '(',
        '"2021"[Date - Publication]',
        ':',
        '"2025"[Date - Publication]',
      ')'
    ].join(' ');

    // First, get the IDs of matching articles
    const searchUrl = `${baseUrl}esearch.fcgi?db=pubmed&term=${encodeURIComponent(filters)}&retmax=200&api_key=${API_KEY}`;
    
    console.log('🌐 Connecting to PubMed API...');
    console.log('📝 Search query:', decodeURIComponent(filters));
    
    const startTime = Date.now();
    const searchResponse = await fetchWithRetry(searchUrl);
    console.log('⏱️  Initial search completed in', ((Date.now() - startTime) / 1000).toFixed(2), 'seconds');
    
    const parser = new xml2js.Parser({ explicitArray: false });
    const parseXml = util.promisify(parser.parseString);
    const searchResult = await parseXml(searchResponse.data);
    
    if (!searchResult.eSearchResult || !searchResult.eSearchResult.IdList || !searchResult.eSearchResult.IdList.Id) {
      console.error('❌ No article IDs found in the search response');
      return;
    }

    const ids = Array.isArray(searchResult.eSearchResult.IdList.Id) 
      ? searchResult.eSearchResult.IdList.Id 
      : [searchResult.eSearchResult.IdList.Id];

    console.log(`\n📊 Found ${ids.length} matching articles`);
    
    // Process articles in smaller batches
    const batchSize = 20;
    const batches = [];
    for (let i = 0; i < ids.length; i += batchSize) {
      batches.push(ids.slice(i, i + batchSize));
    }
    
    console.log(`🔄 Will process articles in ${batches.length} batches\n`);
    
    let allArticles = [];
    for (let i = 0; i < batches.length; i++) {
      const batchIds = batches[i];
      console.log(`📥 Fetching batch ${i + 1}/${batches.length} (${batchIds.length} articles)...`);
      
      const fetchUrl = `${baseUrl}efetch.fcgi?db=pubmed&id=${batchIds.join(',')}&retmode=xml&api_key=${API_KEY}`;
      const fetchStartTime = Date.now();
      const fetchResponse = await fetchWithRetry(fetchUrl);
      console.log('⏱️  Batch fetch completed in', ((Date.now() - fetchStartTime) / 1000).toFixed(2), 'seconds');
      
      const fetchResult = await parseXml(fetchResponse.data);
      
      if (fetchResult.PubmedArticleSet && fetchResult.PubmedArticleSet.PubmedArticle) {
        const batchArticles = Array.isArray(fetchResult.PubmedArticleSet.PubmedArticle)
          ? fetchResult.PubmedArticleSet.PubmedArticle
          : [fetchResult.PubmedArticleSet.PubmedArticle];
        
        allArticles = allArticles.concat(batchArticles);
      }
      
      if (i < batches.length - 1) {
        console.log('⏳ Waiting between batches...');
        await delay(1000);
      }
    }
    
    console.log(`\n📚 Processing ${allArticles.length} articles...`);
    let processedCount = 0;
    
    allArticles.forEach(article => {
      processedCount++;
      if (processedCount % 10 === 0) {
        console.log(`⏳ Processed ${processedCount}/${allArticles.length} articles...`);
      }
      
      const articleData = article.MedlineCitation.Article;
      const title = articleData.ArticleTitle;
      
      const pubDate = article.MedlineCitation.Article.Journal.JournalIssue.PubDate;
      const year = pubDate.Year || '';
      const titleWithYear = `${title} (${year})`;
      
      if (articleData.AuthorList && articleData.AuthorList.Author) {
        const authors = Array.isArray(articleData.AuthorList.Author) 
          ? articleData.AuthorList.Author 
          : [articleData.AuthorList.Author];
        
        authors.forEach(author => {
          let fullName = '';
          if (author.LastName && author.ForeName) {
            fullName = `${author.ForeName} ${author.LastName}`;
          } else if (author.LastName) {
            fullName = author.LastName;
          } else if (author.CollectiveName) {
            fullName = author.CollectiveName;
          }
          
          if (!authorMap.has(fullName)) {
            authorMap.set(fullName, {
              affiliations: new Set(),
              titles: new Set()
            });
          }
          
          authorMap.get(fullName).titles.add(titleWithYear);
          
          if (author.AffiliationInfo) {
            const affiliations = Array.isArray(author.AffiliationInfo) 
              ? author.AffiliationInfo 
              : [author.AffiliationInfo];
            
            affiliations.forEach(affiliation => {
              if (affiliation.Affiliation) {
                authorMap.get(fullName).affiliations.add(affiliation.Affiliation);
              }
            });
          }
        });
      }
    });
    
    console.log('\n📊 Statistics:');
    console.log(`   📝 Total unique authors: ${authorMap.size}`);
    
    console.log('\n💾 Creating CSV file...');
    const csvHeader = 'Author Name,Affiliations,Titles\n';
    const csvRows = Array.from(authorMap.entries()).map(([author, data]) => {
      const affiliations = Array.from(data.affiliations).join('; ');
      const titles = Array.from(data.titles).join('; ');
      return `"${author}","${affiliations}","${titles}"`;
    });
    
    const csvContent = csvHeader + csvRows.join('\n');
    
    const sanitizedSearchTerm = searchTerm.replace(/[^a-zA-Z0-9]/g, '_');
    const outputFile = path.join(process.cwd(), `pubmed_results_${sanitizedSearchTerm}_2021-2025_${Date.now()}.csv`);
    fs.writeFileSync(outputFile, csvContent, 'utf8');
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n✅ Process completed successfully!');
    console.log('📁 Results saved to:', outputFile);
    console.log(`⏱️  Total execution time: ${totalTime} seconds\n`);
    
  } catch (error) {
    console.error('\n❌ Error occurred:');
    console.error('   ', error.message);
    if (error.response) {
      console.error('📡 API Response Status:', error.response.status);
      console.error('📄 API Response Data:', error.response.data);
      if (error.response.status === 429) {
        console.error('⚠️  You have exceeded the API rate limit. Please wait a few seconds and try again.');
      }
    } else if (error.request) {
      console.error('🌐 No response received from the server');
    }
    process.exit(1);
  }
}

// Example usage
const searchTerm = "neuroendocrine tumor";
console.log('🚀 PubMed Author Extraction Tool');
console.log('================================\n');
searchPubMed(searchTerm)
  .then(() => console.log('👋 Search completed. Have a great day!\n'))
  .catch(err => console.error('❌ Failed to complete search:', err));