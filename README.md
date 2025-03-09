# PubMed Author Extraction Tool 📚

A Node.js tool that extracts author information and their affiliations from PubMed articles based on search criteria. The tool supports filtering by publication types and date ranges, making it easy to analyze research contributions in specific fields.

## Features 🌟

- Search PubMed articles with custom queries
- Filter by publication types (e.g., Clinical Trials, Meta-Analyses)
- Filter by publication date range
- Extract author names and their affiliations
- Generate CSV reports with author details
- Handle large result sets with pagination
- Respect PubMed API rate limits
- Configurable search parameters

## Prerequisites 📋

- Node.js (v12 or higher)
- npm or yarn package manager
- PubMed API key (get one from [NCBI](https://www.ncbi.nlm.nih.gov/account/settings/))

## Installation 🔧

1. Clone the repository:
```bash
git clone <repository-url>
cd pubmed-script
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Configure your settings in `src/config.js`:
```javascript
module.exports = {
    API_KEY: 'your-api-key-here',
    SEARCH_TERMS: {
        QUERY: "your search term",
        PUBLICATION_TYPES: [
            "Clinical Trial",
            "Meta-Analysis"
        ]
    },
    PUBLICATION_YEARS: {
        START: '2024',
        END: '2024'
    }
    // ... other settings
};
```

## Usage 🚀

Run the script:
```bash
npm start
# or
yarn start
```

The tool will:
1. Search PubMed for articles matching your criteria
2. Extract author information and affiliations
3. Generate a CSV file with the results

## Configuration Options ⚙️

Edit `src/config.js` to customize:

- `API_KEY`: Your PubMed API key
- `SEARCH_TERMS`:
  - `QUERY`: Your search term
  - `PUBLICATION_TYPES`: Array of publication types to filter
- `PUBLICATION_YEARS`: Date range for publications
- `MAX_RESULTS`: Maximum number of results to fetch (default: 10000)
- `BATCH_SIZE`: Number of articles to process per batch (default: 20)
- `DELAY_MS`: Delay between API requests in milliseconds (default: 1000)

## Output Format 📄

The tool generates a CSV file with the following columns:
- Author Name
- Affiliations (semicolon-separated)
- Titles (semicolon-separated with publication years)

Example output file name: 