import requests
import time
import torch
import os
from datetime import date, timedelta
from transformers import pipeline
from dotenv import load_dotenv

load_dotenv()
max_articles = 20 # set max # of articles to 200 
list_of_topics = ['politics', 'technology', 'gaming', 'economy', 'education', 'celebrities', 'business', 'environment', 'sports']
articles = []
topics = []
cortisol = []
topic_weights = {'politics': 8, 'technology': 5, 'gaming': 3, 'economy': 7, 'education': 5, 'celebrities': 3, 'business': 6, 'environment': 5, 'sports': 3}
for offset in range(0, max_articles, 10):
    for topic in list_of_topics:
        response = requests.get("https://api.freenewsapi.io/v1/news", 
            headers={"x-api-key": os.getenv("NEWS_API_KEY")},
            params={"language": "en", 
                    "published_after":str(date.today() - timedelta(days = 1))+"T00:00:00Z",
                    "offset":offset, 
                    "topic":topic})
            # set a few parameters: language is english, 
            #   articles only yesterday or today (to prevent too little articles at 00:00 hour)
        data = response.json()['data']

        for article in data:
            # get only the title from each article
            articles.append(article['title'])
            topics.append(topic)
        time.sleep(0.5) # as 2 calls per second


sentiment_pipeline = pipeline("sentiment-analysis")
results = sentiment_pipeline(articles)
for title, cortisol_output, topic in zip(articles, results, topics):
    score = topic_weights[topic]
    if (cortisol_output['label'] == 'POSITIVE'):
        score *= 0.75*cortisol_output['score']
    else: 
        score *= 1.25 * cortisol_output['score']
    cortisol.append(score)
    print(f"{title} has cortisol {score}")
