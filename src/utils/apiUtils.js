const axios = require('axios');
const { DELAY_MS } = require('../config');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url, retries = 3, delayMs = DELAY_MS) {
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

module.exports = {
    delay,
    fetchWithRetry
}; 