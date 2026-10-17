import requests
import time
import torch
import os
import sqlite3
from datetime import date, timedelta
from transformers import pipeline
from dotenv import load_dotenv

max_articles = 10 # set max # of articles to 200 
end_program = False # if error code 429 (no calls left)
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
offset = {topic: 0 for topic in list_of_topics} 
topic_weights = {
    'politics': 8, 'technology': 5, 'gaming': 3, 'economy': 7, 
    'education': 5, 'celebrities': 3, 'business': 6, 'environment': 5, 'sports': 3}
articles = {} # contains article title (key) mapped to topics, score, respectively

# load api key 
load_dotenv()
sentiment_pipeline = pipeline("sentiment-analysis")
count_before = -1
while (len(articles) < max_articles) and (len(articles) != count_before) and (not end_program):
    count_before = len(articles) # check if number of articles is different 
    for topic in list_of_topics:
        response = requests.get("https://api.freenewsapi.io/v1/news", 
                                headers={"x-api-key": os.getenv("NEWS_API_KEY")},
                                params={"language": "en", 
                                        "country":"ca",
                                        "published_after":str(date.today() - timedelta(days = 1))+"T00:00:00Z",
                                        "offset":offset[topic], 
                                        "topic":topic})
        if (response.status_code == 200):
            article_list = response.json()
            data = article_list['data']
            for article in data:
                # get the title and the body to scan province keywords.
                article_province = ""

                # request for article info 
                time.sleep(0.5)
                response = requests.get("https://api.freenewsapi.io/v1/details",
                                        headers={"x-api-key": os.getenv("NEWS_API_KEY")},
                                        params={"uuid": article['uuid']})
                if (response.status_code == 429): # only possible error is running out of api calls
                    end_program = True
                    break

                article_info = response.json()['data']
                # check if province name is in the title of the article 
                article_title_lower = article['title'].lower()
                for key in city_to_province:
                    if key in article_title_lower:
                        article_province = city_to_province[key]
                        break

                # if no keyword, check article body, then check for keyword
                if not article_province:
                    body_lower = (article_info['body'] or '').lower()
                    for key in city_to_province:
                        if key in body_lower:
                            article_province = city_to_province[key]
                            break
                            
                # if still no province keyword, default to National.
                if not article_province:
                    article_province = "National" 

                # get sentiment analysis score of article
                score_output = sentiment_pipeline(article['title'])
                score = topic_weights[topic] * score_output[0]['score'] * (0.75 if score_output[0]['label'] == 'POSITIVE' else 1.25)

                # add all to dictionary
                articles[article['title']] = [
                    article['title'], topic, article["publisher"], 
                    article["published_at"], score, article_province, 
                    article_info['thumbnail'], article_info['original_url']]
            time.sleep(0.5) # as 2 calls per second
            offset[topic] += 10
        elif (response.status_code == 429):
            rint(topic, response.status_code, response.text)
            end_program = True
            break
        else:
            print(topic, response.status_code, response.text)
            time.sleep(0.5)
    
print(len(articles))

# establish connection to db
conn = sqlite3.connect('article_list.db')
cursor = conn.cursor()

# create table 
cursor.execute("""
    CREATE TABLE IF NOT EXISTS articles (
    Name TEXT, 
    Topic TEXT, 
    Publisher TEXT,
    Date TEXT,
    SCORE REAL,
    Province TEXT,
    Thumbnail TEXT,
    URL TEXT UNIQUE
    )""")

# insert into db
for row in articles.values():
    cursor.execute("""INSERT OR IGNORE INTO articles (Name, Topic, Publisher, Date, Score, Province, Thumbnail, URL) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                   tuple(row))
conn.commit()
conn.close()