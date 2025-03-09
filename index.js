const axios = require('axios');
const xml2js = require('xml2js');
const util = require('util');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function searchPubMed(searchTerm) {
  try {
    // Step 1: Search for articles
    const baseUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/";
    const searchUrl = `${baseUrl}esearch.fcgi?db=pubmed&term=${encodeURIComponent(searchTerm)}&retmax=100&usehistory=y`;
    
    console.log('Searching PubMed...');
    const searchResponse = await axios.get(searchUrl);
    
    // Add a small delay between requests
    await delay(1000);
    
    console.log(searchResponse.data);
    const parser = new xml2js.Parser({ explicitArray: false });
    const parseXml = util.promisify(parser.parseString);
    const searchResult = await parseXml(searchResponse.data);
    
    // Get the query key and web environment for use in fetching
    const queryKey = searchResult.eSearchResult.QueryKey;
    const webEnv = searchResult.eSearchResult.WebEnv;
    
    // Step 2: Fetch full records with author information
    const fetchUrl = `${baseUrl}efetch.fcgi?db=pubmed&query_key=${queryKey}&WebEnv=${webEnv}&retmode=xml`;
    console.log('Fetching articles from:', fetchUrl);
    const fetchResponse = await axios.get(fetchUrl);
    const fetchResult = await parseXml(fetchResponse.data);
    
    if (!fetchResult.PubmedArticleSet || !fetchResult.PubmedArticleSet.PubmedArticle) {
      console.error('No articles found in the response');
      console.log('Response structure:', JSON.stringify(fetchResult, null, 2));
      return;
    }
    
    const articles = Array.isArray(fetchResult.PubmedArticleSet.PubmedArticle) 
      ? fetchResult.PubmedArticleSet.PubmedArticle 
      : [fetchResult.PubmedArticleSet.PubmedArticle];
    
    console.log(`Processing ${articles.length} articles...`);
    
    articles.forEach(article => {
      const articleData = article.MedlineCitation.Article;
      const title = articleData.ArticleTitle;
      console.log(`Title: ${title}`);
      
      // Extract authors and their affiliations
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
          
          console.log(`  Author: ${fullName}`);
          
          // Get affiliations
          if (author.AffiliationInfo) {
            const affiliations = Array.isArray(author.AffiliationInfo) 
              ? author.AffiliationInfo 
              : [author.AffiliationInfo];
            
            affiliations.forEach(affiliation => {
              if (affiliation.Affiliation) {
                console.log(`    Affiliation: ${affiliation.Affiliation}`);
              }
            });
          }
        });
      }
      console.log("\n");
    });
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    } else if (error.request) {
      console.error('No response received');
    }
    process.exit(1); // Add this to ensure the script terminates on error
  }
}

// Example usage
const searchTerm = "neuroendocrine tumor";
searchPubMed(searchTerm)
  .then(() => console.log('Search completed.'))
  .catch(err => console.error('Failed to complete search:', err));