// Configuration constants
module.exports = {
    API_KEY: '1a684dcfeb101623946bdc604d2c4ffd3a09',
    BASE_URL: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/',
    BATCH_SIZE: 20,
    DELAY_MS: 1000,
    PUBLICATION_YEARS: {
        START: '2024',
        END: '2024'
    },
    MAX_RESULTS: 10000, // Maximum number of results to fetch
    DEFAULT_RETMAX: 500, // Number of results per page
    SEARCH_TERMS: {
        QUERY: "neuroendocrine tumor",
        PUBLICATION_TYPES: [
            "Clinical Trial",
            "Meta-Analysis"
        ]
    }
}; 