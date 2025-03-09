function validateEnv() {
    if (!process.env.PUBMED_API_KEY) {
        console.error('\n❌ Error: PUBMED_API_KEY is not set in .env file');
        console.error('Please create a .env file with your PubMed API key:');
        console.error('PUBMED_API_KEY=your_api_key_here\n');
        process.exit(1);
    }
}

module.exports = { validateEnv }; 