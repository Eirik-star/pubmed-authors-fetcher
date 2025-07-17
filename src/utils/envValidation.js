function validateEnv() {
    const key = process.env.PUBMED_API_KEY;

    if (!key) {
        console.error('\n❌ Missing required environment variable: PUBMED_API_KEY');
        console.error('👉 Please create a `.env` file with the following line:');
        console.error('   PUBMED_API_KEY=your_api_key_here\n');
        process.exit(1);
    }
}

module.exports = { validateEnv };
