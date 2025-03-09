import requests
import xml.etree.ElementTree as ET

# Step 1: Search for articles
search_term = "cancer immunotherapy"
base_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
search_url = f"{base_url}esearch.fcgi?db=pubmed&term={search_term}&retmax=100&usehistory=y"

search_response = requests.get(search_url)
search_tree = ET.fromstring(search_response.content)

# Get the query key and web environment for use in fetching
query_key = search_tree.find("QueryKey").text
web_env = search_tree.find("WebEnv").text

# Step 2: Fetch full records with author information
fetch_url = f"{base_url}efetch.fcgi?db=pubmed&query_key={query_key}&WebEnv={web_env}&retmode=xml"
fetch_response = requests.get(fetch_url)
fetch_tree = ET.fromstring(fetch_response.content)

# Step 3: Extract author information and affiliations
for article in fetch_tree.findall(".//PubmedArticle"):
    title = article.find(".//ArticleTitle").text
    print(f"Title: {title}")
    
    # Extract authors and their affiliations
    author_list = article.find(".//AuthorList")
    if author_list is not None:
        for author in author_list.findall(".//Author"):
            last_name = author.find(".//LastName")
            fore_name = author.find(".//ForeName")
            
            full_name = ""
            if last_name is not None and fore_name is not None:
                full_name = f"{fore_name.text} {last_name.text}"
            elif last_name is not None:
                full_name = last_name.text
                
            print(f"  Author: {full_name}")
            
            # Get affiliations
            affiliation = author.find(".//Affiliation")
            if affiliation is not None:
                print(f"    Affiliation: {affiliation.text}")
    print("\n")