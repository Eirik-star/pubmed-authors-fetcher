const axios = require('axios');
const { DELAY_MS } = require('../config');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url, retries = 3, delayMs = DELAY_MS) {
    let attempt = 0;

    while (attempt < retries) {
        try {
            if (attempt > 0) {
                console.log(`🔄 Retry attempt ${attempt + 1}/${retries}...`);
                await delay(delayMs);
            }

            return await axios.get(url);
        } catch (error) {
            attempt++;

            const isLastAttempt = attempt === retries;
            console.log(`⚠️  Request failed${isLastAttempt ? '.' : `, retrying in ${delayMs / 1000} seconds...`}`);

            if (isLastAttempt) throw error;

            await delay(delayMs);
        }
    }
}

module.exports = {
    delay,
    fetchWithRetry
};
