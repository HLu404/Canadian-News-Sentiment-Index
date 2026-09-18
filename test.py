import requests
import time
import torch
import os
from datetime import date, timedelta
from transformers import pipeline
from dotenv import load_dotenv

list_of_topics = ['politics', 'technology', 'gaming', 'economy', 'education', 'celebrities', 'business', 'environment', 'sports']

load_dotenv()
response = requests.get("https://api.freenewsapi.io/v1/news", 
    headers={"x-api-key": os.getenv("NEWS_API_KEY")},
    params={"language": "en", 
            "published_after":str(date.today() - timedelta(days = 1))+"T00:00:00Z",
            "topics": 'world'})
        # set a few parameters: language is english, 
        #   articles only yesterday or today (to prevent too little articles at 00:00 hour)
data = response.json()
print(data)