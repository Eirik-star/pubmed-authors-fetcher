const fs = require('fs');
const path = require('path');
const { PUBLICATION_YEARS } = require('../config');

class CSVService {
    createCSVContent(authorMap) {
        const csvHeader = 'Author Name,Affiliations,Titles\n';
        const csvRows = Array.from(authorMap.entries()).map(([author, data]) => {
            const affiliations = Array.from(data.affiliations)
                .filter(aff => aff && typeof aff === 'string')
                .join('; ');
            
            const titles = Array.from(data.titles)
                .filter(title => title && typeof title === 'string')
                .join('; ');
            
            // Escape quotes and special characters
            const escapedAuthor = this.escapeCSVField(author);
            const escapedAffiliations = this.escapeCSVField(affiliations);
            const escapedTitles = this.escapeCSVField(titles);
            
            return `"${escapedAuthor}","${escapedAffiliations}","${escapedTitles}"`;
        });
        
        return csvHeader + csvRows.join('\n');
    }

    escapeCSVField(field) {
        if (!field) return '';
        // Replace double quotes with two double quotes (CSV escape sequence)
        return field.replace(/"/g, '""')
                   .replace(/\r?\n|\r/g, ' ') // Replace newlines with spaces
                   .trim();
    }

    writeToFile(content, searchTerm) {
        const sanitizedSearchTerm = searchTerm.replace(/[^a-zA-Z0-9]/g, '_');
        const yearRange = `${PUBLICATION_YEARS.START}_${PUBLICATION_YEARS.END}`;
        const outputFile = path.join(
            process.cwd(), 
            `pubmed_results_${sanitizedSearchTerm}_${yearRange}_${Date.now()}.csv`
        );
        
        fs.writeFileSync(outputFile, content, 'utf8');
        return outputFile;
    }
}

module.exports = new CSVService(); 