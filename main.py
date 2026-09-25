import requests
import time
import torch
import os
from datetime import date, timedelta
from transformers import pipeline
from dotenv import load_dotenv

max_articles = 200 # set max # of articles to 200 
list_of_provinces = [
    'Yukon', 'Northwest Territories', 'Nunavut', 'Quebec', 'Ontario', 
    'Manitoba', 'Saskatchewan', 'Alberta', 'British Columbia']
city_to_province = {
    "toronto": "ontario", "ottawa": "ontario", "mississauga": "ontario", 
    "brampton": "ontario", "hamilton": "ontario", "london": "ontario",
    "kitchener": "ontario", "waterloo": "ontario", "windsor": "ontario",
    "barrie": "ontario", "guelph": "ontario", "thunder bay": "ontario",
    "montreal": "quebec", "quebec city": "quebec", "laval": "quebec",
    "gatineau": "quebec", "sherbrooke": "quebec",
    "vancouver": "bc", "victoria": "bc", "surrey": "bc",
    "burnaby": "bc", "kelowna": "bc", "nanaimo": "bc",
    "calgary": "alberta", "edmonton": "alberta", "red deer": "alberta",
    "lethbridge": "alberta", "medicine hat": "alberta",
    "winnipeg": "manitoba", "brandon": "manitoba",
    "regina": "saskatchewan", "saskatoon": "saskatchewan",
    "halifax": "nova scotia", "sydney": "nova scotia",
    "fredericton": "new brunswick", "moncton": "new brunswick",
    "st. john's": "newfoundland", "corner brook": "newfoundland",
    "charlottetown": "pei",
    "whitehorse": "yukon",
    "yellowknife": "northwest territories",
    "iqaluit": "nunavut"}
list_of_topics = [
    'politics', 'technology', 'gaming', 'economy', 'education', 
    'celebrities', 'business', 'environment', 'sports']
topic_weights = {
    'politics': 8, 'technology': 5, 'gaming': 3, 'economy': 7, 
    'education': 5, 'celebrities': 3, 'business': 6, 'environment': 5, 'sports': 3}
articles = {} # contains article title (key) mapped to topics, score, respectively

load_dotenv()
sentiment_pipeline = pipeline("sentiment-analysis")

for offset in range(0, max_articles, 10):
    for topic in list_of_topics:
        response = requests.get("https://api.freenewsapi.io/v1/news", 
                                headers={"x-api-key": os.getenv("NEWS_API_KEY")},
                                params={"language": "en", 
                                        "country":"ca",
                                        "published_after":str(date.today() - timedelta(days = 1))+"T00:00:00Z",
                                        "offset":offset, 
                                        "topic":topic})
            # set a few parameters: language is english, 
            #   articles only yesterday or today (to prevent too little articles at 00:00 hour)
        data = response.json()['data']

        for article in data:
            # get only the title from each article
            # get title, scan title, check for keyword
            # if no keyword, check article body, then check for keyword
            # if none, then randomly generate number from 1 to 10, and then pick a province. 

            score_output = sentiment_pipeline(article)
            score = topic_weights[topic] * (0.75 if score_output['label'] == 'POSITIVE' else 1.25)
            articles[article['title']] = [topic, score]
        time.sleep(0.5) # as 2 calls per second
